//! Property tests of the SRV ordering: every record is kept, priorities are respected, and no
//! combination of weights (all zero, all maximal) can make the draw panic.

use super::*;
use proptest::prelude::*;
use rand::{rngs::StdRng, SeedableRng};

fn record() -> impl Strategy<Value = SrvRecord> {
    (
        any::<u16>(),
        prop_oneof![Just(0u16), Just(u16::MAX), any::<u16>()],
        any::<u16>(),
        "[a-z]{1,8}",
    )
        .prop_map(|(priority, weight, port, target)| SrvRecord {
            priority,
            weight,
            port,
            target,
        })
}

proptest! {
    #[test]
    fn ordering_is_a_permutation_sorted_by_priority(
        records in prop::collection::vec(record(), 0..32),
        seed in any::<u64>(),
    ) {
        let ordered = order(records.clone(), &mut StdRng::seed_from_u64(seed));
        prop_assert!(ordered.windows(2).all(|pair| pair[0].priority <= pair[1].priority));
        let mut expected = records;
        let mut found = ordered;
        let key = |record: &SrvRecord| (record.priority, record.weight, record.port, record.target.clone());
        expected.sort_by_key(key);
        found.sort_by_key(key);
        prop_assert_eq!(found, expected);
    }

    #[test]
    fn a_target_never_keeps_its_trailing_dot_unless_it_is_the_root(name in "[a-z.]{0,12}") {
        let target = srv_target(&name);
        prop_assert!(target == "." || !target.ends_with('.'), "{target}");
    }
}
