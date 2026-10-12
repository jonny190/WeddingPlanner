"""Constraint-aware table allocation.

Pure functions with no database access: the seating service converts guests and
tables into these structures and writes the result back.

Hard rules: table capacity, "keep apart" pairs, "sit together" pairs and locked
seats. Soft goal: keep guests from the same group (e.g. "Uni friends") together.

Strategy: guests linked by "sit together" rules (and their plus-ones) form a
cluster. Clusters are placed with a depth-first search that backtracks when it
hits a dead end, trying a group-friendly order first and a hardest-first order
second, each with a step budget. If neither finds a full plan, a greedy pass
seats as many people as possible and reports why the rest could not be placed.
"""

from collections import Counter, defaultdict
from collections.abc import Hashable, Iterable
from dataclasses import dataclass, field
from itertools import combinations

TableId = Hashable
PartyId = Hashable


@dataclass(frozen=True)
class TableSpec:
    id: TableId
    capacity: int


@dataclass(frozen=True)
class PartySpec:
    """A guest and anyone who must take a seat with them (their plus-one)."""

    id: PartyId
    size: int
    group: str | None = None
    locked_table: TableId | None = None


@dataclass
class SeatingResult:
    assignments: dict[PartyId, TableId] = field(default_factory=dict)
    unplaced: dict[PartyId, str] = field(default_factory=dict)


@dataclass
class Violation:
    kind: str  # "capacity" | "apart" | "together"
    party_ids: tuple[PartyId, ...]
    table_ids: tuple[TableId, ...]


@dataclass
class _Cluster:
    index: int
    members: list[PartySpec]
    size: int
    group: str | None
    locked_table: TableId | None


class _UnionFind:
    def __init__(self, items: Iterable[PartyId]) -> None:
        self.parent = {item: item for item in items}

    def find(self, item: PartyId) -> PartyId:
        while self.parent[item] != item:
            self.parent[item] = self.parent[self.parent[item]]
            item = self.parent[item]
        return item

    def union(self, a: PartyId, b: PartyId) -> None:
        self.parent[self.find(a)] = self.find(b)


class _Board:
    """Mutable seating state with cheap place/undo for the search."""

    def __init__(self, tables: list[TableSpec], adjacency: dict[int, set[int]]) -> None:
        self.order = {t.id: i for i, t in enumerate(tables)}
        self.remaining = {t.id: t.capacity for t in tables}
        self.clusters_at: dict[TableId, set[int]] = defaultdict(set)
        self.groups_at: dict[TableId, Counter] = defaultdict(Counter)
        self.placement: dict[int, TableId] = {}
        self.adjacency = adjacency

    def copy(self) -> "_Board":
        board = _Board([], self.adjacency)
        board.order = self.order
        board.remaining = dict(self.remaining)
        board.clusters_at = defaultdict(set, {t: set(c) for t, c in self.clusters_at.items()})
        board.groups_at = defaultdict(Counter, {t: Counter(g) for t, g in self.groups_at.items()})
        board.placement = dict(self.placement)
        return board

    def fits(self, cluster: _Cluster, table: TableId) -> bool:
        return self.remaining[table] >= cluster.size and not (
            self.adjacency[cluster.index] & self.clusters_at[table]
        )

    def place(self, cluster: _Cluster, table: TableId) -> None:
        self.remaining[table] -= cluster.size
        self.clusters_at[table].add(cluster.index)
        self.groups_at[table][cluster.group] += cluster.size
        self.placement[cluster.index] = table

    def unplace(self, cluster: _Cluster, table: TableId) -> None:
        self.remaining[table] += cluster.size
        self.clusters_at[table].discard(cluster.index)
        groups = self.groups_at[table]
        groups[cluster.group] -= cluster.size
        if groups[cluster.group] <= 0:
            del groups[cluster.group]
        del self.placement[cluster.index]

    def candidates(self, cluster: _Cluster) -> list[TableId]:
        def score(table: TableId) -> tuple:
            groups = self.groups_at[table]
            same_group = groups.get(cluster.group, 0)
            other_groups = sum(1 for g in groups if g != cluster.group)
            # Join your group, avoid mixing groups, then fill tables snugly.
            return (
                -same_group,
                other_groups,
                self.remaining[table] - cluster.size,
                self.order[table],
            )

        return sorted((t for t in self.remaining if self.fits(cluster, t)), key=score)


def _search(board: _Board, order: list[_Cluster], max_steps: int) -> bool:
    """Iterative backtracking search. Leaves the board holding the solution on success."""
    if not order:
        return True
    steps = 0
    stack: list[list] = [[board.candidates(order[0]), 0]]
    while stack:
        depth = len(stack) - 1
        cluster = order[depth]
        options, tried = stack[-1]
        if tried > 0:
            board.unplace(cluster, options[tried - 1])
        if tried >= len(options):
            stack.pop()
            continue
        stack[-1][1] = tried + 1
        steps += 1
        if steps > max_steps:
            return False
        board.place(cluster, options[tried])
        if depth + 1 == len(order):
            return True
        stack.append([board.candidates(order[depth + 1]), 0])
    return False


def solve_seating(
    tables: list[TableSpec],
    parties: list[PartySpec],
    apart: Iterable[tuple[PartyId, PartyId]] = (),
    together: Iterable[tuple[PartyId, PartyId]] = (),
    max_steps: int = 20_000,
) -> SeatingResult:
    result = SeatingResult()
    parties = [p for p in parties if p.size > 0]
    if not parties:
        return result
    if not tables:
        result.unplaced = {p.id: "No tables have been set up for this event" for p in parties}
        return result

    by_id = {p.id: p for p in parties}
    capacity = {t.id: t.capacity for t in tables}
    largest_table = max(capacity.values())
    apart_pairs = {
        frozenset(pair) for pair in apart if pair[0] != pair[1] and all(p in by_id for p in pair)
    }

    uf = _UnionFind(by_id)
    for a, b in together:
        if a in by_id and b in by_id:
            uf.union(a, b)
    member_lists: dict[PartyId, list[PartySpec]] = defaultdict(list)
    for party in parties:
        member_lists[uf.find(party.id)].append(party)

    clusters: list[_Cluster] = []
    cluster_of: dict[PartyId, int] = {}
    for members in member_lists.values():
        size = sum(m.size for m in members)
        locked = {m.locked_table for m in members if m.locked_table in capacity}
        reason = None
        if any(frozenset((x.id, y.id)) in apart_pairs for x, y in combinations(members, 2)):
            reason = "Has conflicting 'sit together' and 'keep apart' rules"
        elif len(locked) > 1:
            reason = "Must sit together with someone locked to a different table"
        elif size > (capacity[next(iter(locked))] if locked else largest_table):
            reason = f"Needs {size} seats together, which is more than the table holds"
        if reason:
            result.unplaced.update({m.id: reason for m in members})
            continue
        groups = Counter(m.group for m in members)
        cluster = _Cluster(
            index=len(clusters),
            members=members,
            size=size,
            group=groups.most_common(1)[0][0],
            locked_table=next(iter(locked)) if locked else None,
        )
        clusters.append(cluster)
        for m in members:
            cluster_of[m.id] = cluster.index

    adjacency: dict[int, set[int]] = defaultdict(set)
    for pair in apart_pairs:
        a, b = tuple(pair)
        ca, cb = cluster_of.get(a), cluster_of.get(b)
        if ca is not None and cb is not None and ca != cb:
            adjacency[ca].add(cb)
            adjacency[cb].add(ca)

    # Locked guests stay where the planner put them.
    base = _Board(tables, adjacency)
    free: list[_Cluster] = []
    for cluster in clusters:
        if cluster.locked_table is None:
            free.append(cluster)
        elif base.remaining[cluster.locked_table] >= cluster.size:
            base.place(cluster, cluster.locked_table)
        else:
            result.unplaced.update(
                {m.id: "Locked to a table that no longer has enough seats" for m in cluster.members}
            )

    group_size = Counter()
    for cluster in free:
        group_size[cluster.group] += cluster.size

    def hardest_first(c: _Cluster) -> tuple:
        return (-len(adjacency[c.index]), -c.size, c.index)

    group_order = sorted(
        free,
        key=lambda c: (c.group is None, -group_size[c.group], c.group or "", *hardest_first(c)),
    )
    difficulty_order = sorted(free, key=hardest_first)

    board = None
    for order in (group_order, difficulty_order):
        attempt = base.copy()
        if _search(attempt, order, max_steps):
            board = attempt
            break

    if board is None:
        board = base.copy()
        for cluster in difficulty_order:
            options = board.candidates(cluster)
            if options:
                board.place(cluster, options[0])
                continue
            if all(board.remaining[t] < cluster.size for t in board.remaining):
                reason = "Not enough free seats on any table"
            else:
                reason = "Every table with space has someone they must be kept apart from"
            result.unplaced.update({m.id: reason for m in cluster.members})

    for index, table in board.placement.items():
        for member in clusters[index].members:
            result.assignments[member.id] = table
    return result


def check_plan(
    tables: list[TableSpec],
    parties: list[PartySpec],
    assignments: dict[PartyId, TableId],
    apart: Iterable[tuple[PartyId, PartyId]] = (),
    together: Iterable[tuple[PartyId, PartyId]] = (),
) -> list[Violation]:
    """Find rule breaches in an existing (possibly hand-edited) plan."""
    violations: list[Violation] = []
    sizes = {p.id: p.size for p in parties}
    used: Counter = Counter()
    for party_id, table in assignments.items():
        used[table] += sizes.get(party_id, 1)
    for table in tables:
        if used[table.id] > table.capacity:
            seated = tuple(p for p, t in assignments.items() if t == table.id)
            violations.append(Violation("capacity", seated, (table.id,)))
    for a, b in apart:
        if a in assignments and assignments.get(b) == assignments[a]:
            violations.append(Violation("apart", (a, b), (assignments[a],)))
    for a, b in together:
        if a in assignments and b in assignments and assignments[a] != assignments[b]:
            violations.append(Violation("together", (a, b), (assignments[a], assignments[b])))
    return violations
