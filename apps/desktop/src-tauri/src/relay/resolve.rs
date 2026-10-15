//! Finding the server for a domain (RFC 6120 section 3.2 and XEP-0368): SRV records, direct TLS
//! first, STARTTLS second, then the well-known ports when the domain publishes no SRV at all.

use hickory_resolver::proto::rr::RData;
use hickory_resolver::TokioResolver;
use rand::RngExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Security {
    /// TLS from the first byte (port 5223 by convention, `_xmpps-client`).
    DirectTls,
    /// Plain stream first, upgraded with `<starttls/>` (port 5222, `_xmpp-client`).
    StartTls,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Candidate {
    pub host: String,
    pub port: u16,
    pub security: Security,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SrvRecord {
    pub priority: u16,
    pub weight: u16,
    pub port: u16,
    pub target: String,
}

/// Every address worth trying, in order. Never fails: without SRV records (or without a working
/// resolver) the domain itself on the standard ports is the answer.
pub async fn candidates(domain: &str) -> Vec<Candidate> {
    let mut found = Vec::new();
    if let Ok(resolver) = TokioResolver::builder_tokio().and_then(|builder| builder.build()) {
        for (service, security) in [
            ("_xmpps-client._tcp", Security::DirectTls),
            ("_xmpp-client._tcp", Security::StartTls),
        ] {
            let records = srv(&resolver, &format!("{service}.{domain}.")).await;
            log::debug!("{service} for the domain: {} record(s)", records.len());
            found.extend(
                order(records, &mut rand::rng())
                    .into_iter()
                    .map(|record| Candidate {
                        host: record.target,
                        port: record.port,
                        security,
                    }),
            );
        }
    }
    if found.is_empty() {
        log::debug!("no SRV record, trying the domain on 5223 then 5222");
        found.push(Candidate {
            host: domain.to_owned(),
            port: 5223,
            security: Security::DirectTls,
        });
        found.push(Candidate {
            host: domain.to_owned(),
            port: 5222,
            security: Security::StartTls,
        });
    }
    found
}

async fn srv(resolver: &TokioResolver, name: &str) -> Vec<SrvRecord> {
    let Ok(lookup) = resolver.srv_lookup(name).await else {
        return Vec::new();
    };
    lookup
        .answers()
        .iter()
        .filter_map(|record| match &record.data {
            RData::SRV(srv) => Some(SrvRecord {
                priority: srv.priority,
                weight: srv.weight,
                port: srv.port,
                target: srv.target.to_utf8().trim_end_matches('.').to_owned(),
            }),
            _ => None,
        })
        // A single record with target "." means "this service does not exist here" (RFC 2782).
        .filter(|record| !record.target.is_empty())
        .collect()
}

/// RFC 2782 ordering: lowest priority first; within a priority, a weighted random draw so that
/// the load spreads the way the domain's administrator asked.
pub fn order(mut records: Vec<SrvRecord>, rng: &mut impl RngExt) -> Vec<SrvRecord> {
    records.sort_by_key(|record| record.priority);
    let mut ordered = Vec::with_capacity(records.len());
    while !records.is_empty() {
        let priority = records[0].priority;
        let mut group: Vec<SrvRecord> = records
            .iter()
            .take_while(|record| record.priority == priority)
            .cloned()
            .collect();
        records.drain(..group.len());
        // Weight-zero records go first in the running sum so that they are picked only when the
        // draw lands on zero: rarely, as the RFC wants.
        group.sort_by_key(|record| record.weight);
        while !group.is_empty() {
            let total: u32 = group.iter().map(|record| u32::from(record.weight)).sum();
            let draw = rng.random_range(0..=total);
            let mut running = 0;
            let picked = group
                .iter()
                .position(|record| {
                    running += u32::from(record.weight);
                    running >= draw
                })
                .unwrap_or(0);
            ordered.push(group.remove(picked));
        }
    }
    ordered
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::{rngs::StdRng, SeedableRng};

    fn record(priority: u16, weight: u16, target: &str) -> SrvRecord {
        SrvRecord {
            priority,
            weight,
            port: 5222,
            target: target.into(),
        }
    }

    #[test]
    fn lower_priority_comes_first_whatever_the_weight() {
        let records = vec![
            record(20, 100, "backup"),
            record(10, 0, "primary"),
            record(30, 50, "last"),
        ];
        let targets: Vec<_> = order(records, &mut StdRng::seed_from_u64(1))
            .into_iter()
            .map(|record| record.target)
            .collect();
        assert_eq!(targets, ["primary", "backup", "last"]);
    }

    #[test]
    fn within_a_priority_heavier_records_are_drawn_first_more_often() {
        let mut heavy_first = 0;
        for seed in 0..200 {
            let records = vec![record(10, 1, "light"), record(10, 99, "heavy")];
            let ordered = order(records, &mut StdRng::seed_from_u64(seed));
            assert_eq!(ordered.len(), 2, "every record is kept");
            if ordered[0].target == "heavy" {
                heavy_first += 1;
            }
        }
        assert!(
            heavy_first > 170,
            "heavy came first {heavy_first} times out of 200"
        );
    }

    #[test]
    fn all_zero_weights_still_keep_every_record() {
        let records = vec![record(5, 0, "a"), record(5, 0, "b"), record(5, 0, "c")];
        let ordered = order(records, &mut StdRng::seed_from_u64(7));
        let mut targets: Vec<_> = ordered.into_iter().map(|record| record.target).collect();
        targets.sort();
        assert_eq!(targets, ["a", "b", "c"]);
    }

    #[test]
    fn nothing_in_gives_nothing_out() {
        assert!(order(Vec::new(), &mut StdRng::seed_from_u64(0)).is_empty());
    }
}
