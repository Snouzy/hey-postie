//! Finding the server for a domain (RFC 6120 section 3.2 and XEP-0368): SRV records, direct TLS
//! first, STARTTLS second, then the well-known ports when the domain publishes no SRV at all.

use std::time::Duration;

use hickory_resolver::proto::rr::RData;
use hickory_resolver::TokioResolver;
use rand::RngExt;

use super::RelayError;

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

/// The addresses to try, in order, and whether they were guessed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Candidates {
    pub list: Vec<Candidate>,
    /// No SRV record at all: the list is the domain itself on the standard ports.
    pub guessed: bool,
}

/// DNS answers rarely take long; past this, the domain is treated as having no SRV record.
const LOOKUP_TIMEOUT: Duration = Duration::from_secs(5);

/// Every address worth trying. With SRV records, their order; without any, the domain itself
/// on the standard ports. A domain whose records say "no XMPP here" (a single `.` target,
/// RFC 6120 section 3.2.1) gets no fallback: the administrator asked for none.
pub async fn candidates(domain: &str) -> Result<Candidates, RelayError> {
    let records = tokio::time::timeout(LOOKUP_TIMEOUT, srv_records(domain))
        .await
        .unwrap_or_default();
    let mut list = Vec::new();
    let mut declined = false;
    for (security, found) in records {
        let usable: Vec<SrvRecord> = found
            .into_iter()
            .filter(|record| record.target != ".")
            .collect();
        declined |= usable.is_empty();
        list.extend(
            order(usable, &mut rand::rng())
                .into_iter()
                .map(|record| Candidate {
                    host: record.target,
                    port: record.port,
                    security,
                }),
        );
    }
    if !list.is_empty() {
        return Ok(Candidates {
            list,
            guessed: false,
        });
    }
    if declined {
        log::debug!("the domain declares that it offers no XMPP service");
        return Err(RelayError::ServerUnreachable("service not offered".into()));
    }
    log::debug!("no SRV record, trying the domain on 5223 then 5222");
    Ok(Candidates {
        list: vec![
            Candidate {
                host: domain.to_owned(),
                port: 5223,
                security: Security::DirectTls,
            },
            Candidate {
                host: domain.to_owned(),
                port: 5222,
                security: Security::StartTls,
            },
        ],
        guessed: true,
    })
}

/// The SRV records of both services, direct TLS first. Empty without a working resolver.
async fn srv_records(domain: &str) -> Vec<(Security, Vec<SrvRecord>)> {
    let Ok(resolver) = TokioResolver::builder_tokio().and_then(|builder| builder.build()) else {
        return Vec::new();
    };
    let mut records = Vec::new();
    for (service, security) in [
        ("_xmpps-client._tcp", Security::DirectTls),
        ("_xmpp-client._tcp", Security::StartTls),
    ] {
        let found = srv(&resolver, &format!("{service}.{domain}.")).await;
        log::debug!("{service} for the domain: {} record(s)", found.len());
        if !found.is_empty() {
            records.push((security, found));
        }
    }
    records
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
                target: srv_target(&srv.target.to_utf8()),
            }),
            _ => None,
        })
        .collect()
}

/// Host names come back with a trailing dot; the root name `.` alone means "no service".
fn srv_target(name: &str) -> String {
    if name == "." {
        return name.to_owned();
    }
    name.trim_end_matches('.').to_owned()
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
    fn a_trailing_dot_is_removed_but_the_root_alone_is_kept() {
        assert_eq!(srv_target("xmpp.example.org."), "xmpp.example.org");
        assert_eq!(srv_target("."), ".");
    }

    #[test]
    fn nothing_in_gives_nothing_out() {
        assert!(order(Vec::new(), &mut StdRng::seed_from_u64(0)).is_empty());
    }
}
