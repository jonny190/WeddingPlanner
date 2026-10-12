import random
import time
from collections import Counter

from app.modules.seating.solver import PartySpec, TableSpec, check_plan, solve_seating


def seats_used(result, parties):
    sizes = {p.id: p.size for p in parties}
    used = Counter()
    for party, table in result.assignments.items():
        used[table] += sizes[party]
    return used


def test_respects_capacity_including_plus_ones():
    tables = [TableSpec("t1", 4), TableSpec("t2", 4)]
    parties = [PartySpec(f"g{i}", 2) for i in range(4)]
    result = solve_seating(tables, parties)
    assert not result.unplaced
    assert all(used <= 4 for used in seats_used(result, parties).values())


def test_keeps_apart_pairs_at_different_tables():
    tables = [TableSpec("t1", 3), TableSpec("t2", 3)]
    parties = [PartySpec(n, 1) for n in "abcdef"]
    apart = [("a", "b"), ("a", "c"), ("b", "c")]
    result = solve_seating(tables, parties, apart=apart)
    # Three mutually hostile guests cannot fit two tables.
    assert len(result.unplaced) == 1
    placed = result.assignments
    for x, y in apart:
        if x in placed and y in placed:
            assert placed[x] != placed[y]


def test_finds_the_only_valid_arrangement():
    # Group preference pulls a and b together, but the rules only allow {a, c} and {b, d}.
    tables = [TableSpec("t1", 2), TableSpec("t2", 2)]
    parties = [
        PartySpec("a", 1, "G"),
        PartySpec("b", 1, "G"),
        PartySpec("c", 1, "H"),
        PartySpec("d", 1, "H"),
    ]
    apart = [("a", "b"), ("a", "d"), ("b", "c")]
    result = solve_seating(tables, parties, apart=apart)
    assert not result.unplaced
    assert result.assignments["a"] == result.assignments["c"]
    assert result.assignments["b"] == result.assignments["d"]


def test_seat_together_pairs_share_a_table():
    tables = [TableSpec("t1", 4), TableSpec("t2", 4)]
    parties = [PartySpec(n, 1) for n in "abcdefgh"]
    result = solve_seating(tables, parties, together=[("a", "h"), ("h", "d")])
    assert result.assignments["a"] == result.assignments["h"] == result.assignments["d"]


def test_conflicting_rules_are_reported():
    tables = [TableSpec("t1", 10)]
    parties = [PartySpec(n, 1) for n in "abc"]
    result = solve_seating(tables, parties, apart=[("a", "c")], together=[("a", "b"), ("b", "c")])
    assert set(result.unplaced) == {"a", "b", "c"}
    assert "conflicting" in result.unplaced["a"]


def test_locked_guests_stay_put():
    tables = [TableSpec("t1", 2), TableSpec("t2", 2)]
    parties = [PartySpec("a", 1, locked_table="t2"), PartySpec("b", 1), PartySpec("c", 1)]
    result = solve_seating(tables, parties)
    assert result.assignments["a"] == "t2"


def test_groups_are_kept_together_when_possible():
    tables = [TableSpec(f"t{i}", 5) for i in range(3)]
    parties = [PartySpec(f"fam{i}", 1, group="Family") for i in range(5)]
    parties += [PartySpec(f"uni{i}", 1, group="Uni") for i in range(5)]
    random.Random(1).shuffle(parties)
    result = solve_seating(tables, parties)
    tables_for = {
        g: {result.assignments[p.id] for p in parties if p.group == g} for g in ("Family", "Uni")
    }
    assert len(tables_for["Family"]) == 1
    assert len(tables_for["Uni"]) == 1


def test_not_enough_seats_reports_reason():
    result = solve_seating([TableSpec("t1", 2)], [PartySpec(n, 1) for n in "abc"])
    assert len(result.assignments) == 2
    assert list(result.unplaced.values()) == ["Not enough free seats on any table"]


def test_no_tables():
    result = solve_seating([], [PartySpec("a", 1)])
    assert "No tables" in result.unplaced["a"]


def test_large_random_wedding_is_valid_and_fast():
    rng = random.Random(42)
    tables = [TableSpec(f"t{i}", 10) for i in range(20)]
    parties = [
        PartySpec(f"g{i}", rng.choice([1, 1, 1, 2]), group=f"group{rng.randrange(12)}")
        for i in range(140)
    ]
    ids = [p.id for p in parties]
    apart = {tuple(sorted(rng.sample(ids, 2))) for _ in range(60)}
    together = {tuple(sorted(rng.sample(ids, 2))) for _ in range(15)} - apart

    started = time.perf_counter()
    result = solve_seating(tables, parties, apart=apart, together=together)
    assert time.perf_counter() - started < 5

    placed = [p for p in parties if p.id in result.assignments]
    violations = check_plan(tables, placed, result.assignments, apart=apart, together=together)
    assert violations == []
    # Every guest is either seated or has a reason.
    assert set(result.assignments) | set(result.unplaced) == set(ids)


def test_check_plan_finds_breaches():
    tables = [TableSpec("t1", 2), TableSpec("t2", 2)]
    parties = [PartySpec("a", 2), PartySpec("b", 1), PartySpec("c", 1)]
    found = check_plan(
        tables,
        parties,
        {"a": "t1", "b": "t1", "c": "t2"},
        apart=[("a", "b")],
        together=[("b", "c")],
    )
    assert sorted(v.kind for v in found) == ["apart", "capacity", "together"]
