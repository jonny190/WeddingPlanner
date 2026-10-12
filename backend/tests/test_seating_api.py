import pytest

from tests.conftest import add_guest


@pytest.fixture
def seating(wedding, day):
    return f"/weddings/{wedding['id']}/events/{day['id']}/seating"


def invite(api, wedding, event, name, plus_one=False, **fields):
    return add_guest(
        api,
        wedding,
        name,
        invitations=[{"event_id": event["id"], "plus_one_allowed": plus_one}],
        **fields,
    )


def test_room_configuration(api, seating):
    tables = api.post(
        f"{seating}/tables/bulk", expected=201, json={"count": 3, "capacity": 8}
    ).json()
    assert [t["name"] for t in tables] == ["Table 1", "Table 2", "Table 3"]

    top = api.post(
        f"{seating}/tables",
        expected=201,
        json={"name": "Top table", "capacity": 6, "shape": "rectangle"},
    ).json()
    api.patch(f"{seating}/tables/{tables[0]['id']}", json={"capacity": 10})
    api.delete(f"{seating}/tables/{tables[2]['id']}")

    plan = api.get(seating).json()
    assert [(t["name"], t["capacity"]) for t in plan["tables"]] == [
        ("Table 1", 10),
        ("Table 2", 8),
        ("Top table", 6),
    ]
    assert plan["stats"]["total_capacity"] == 24
    assert top["shape"] == "rectangle"

    replaced = api.post(
        f"{seating}/tables/bulk",
        expected=201,
        json={"count": 2, "capacity": 12, "replace_existing": True, "name_prefix": "Round"},
    ).json()
    assert [t["name"] for t in replaced] == ["Round 1", "Round 2"]
    assert len(api.get(seating).json()["tables"]) == 2


def test_manual_assignment_enforces_capacity_and_keep_apart(api, wedding, day, seating):
    table = api.post(f"{seating}/tables", expected=201, json={"capacity": 3}).json()
    jo = invite(api, wedding, day, "Jo", plus_one=True)
    sam = invite(api, wedding, day, "Sam")
    ex = invite(api, wedding, day, "Ex")
    api.post(
        f"/weddings/{wedding['id']}/seating-constraints",
        expected=201,
        json={"guest_a_id": sam["id"], "guest_b_id": ex["id"], "kind": "apart"},
    )

    plan = api.put(f"{seating}/assignments/{jo['id']}", json={"table_id": table["id"]}).json()
    assert plan["tables"][0]["seats_used"] == 2  # Jo and their plus-one
    api.put(f"{seating}/assignments/{sam['id']}", json={"table_id": table["id"]})

    full = api.put(
        f"{seating}/assignments/{ex['id']}", expected=409, json={"table_id": table["id"]}
    )
    assert full.json()["code"] == "table_full"

    api.put(f"{seating}/assignments/{jo['id']}", json={"table_id": None})
    clash = api.put(
        f"{seating}/assignments/{ex['id']}", expected=409, json={"table_id": table["id"]}
    )
    assert clash.json()["code"] == "seating_conflict"
    assert "Sam Guest" in clash.json()["detail"]


def test_auto_arrange_respects_rules_and_locks(api, wedding, day, seating):
    tables = api.post(
        f"{seating}/tables/bulk", expected=201, json={"count": 3, "capacity": 4}
    ).json()
    guests = [
        invite(api, wedding, day, f"G{i}", group_name="Family" if i < 4 else "Friends")
        for i in range(10)
    ]
    rivals = (guests[0]["id"], guests[1]["id"])
    api.post(
        f"/weddings/{wedding['id']}/seating-constraints",
        expected=201,
        json={"guest_a_id": rivals[0], "guest_b_id": rivals[1]},
    )
    api.put(
        f"{seating}/assignments/{guests[9]['id']}",
        json={"table_id": tables[2]["id"], "locked": True},
    )

    result = api.post(f"{seating}/auto-arrange", json={}).json()
    assert result["unplaced"] == []
    plan = result["plan"]
    assert plan["violations"] == []
    assert plan["stats"]["guests_unassigned"] == 0
    seated_at = {g["guest_id"]: t["id"] for t in plan["tables"] for g in t["guests"]}
    assert seated_at[rivals[0]] != seated_at[rivals[1]]
    assert seated_at[guests[9]["id"]] == tables[2]["id"]
    assert all(t["seats_used"] <= t["capacity"] for t in plan["tables"])

    cleared = api.delete(f"{seating}/assignments", expected=200).json()
    assert cleared["stats"]["seats_assigned"] == 1  # the locked guest stays


def test_plan_reports_rule_breaches_after_the_fact(api, wedding, day, seating):
    table = api.post(f"{seating}/tables", expected=201, json={"capacity": 10}).json()
    a, b = invite(api, wedding, day, "A"), invite(api, wedding, day, "B")
    for guest in (a, b):
        api.put(f"{seating}/assignments/{guest['id']}", json={"table_id": table["id"]})
    api.post(
        f"/weddings/{wedding['id']}/seating-constraints",
        expected=201,
        json={"guest_a_id": a["id"], "guest_b_id": b["id"]},
    )
    api.put(
        f"/weddings/{wedding['id']}/events/{day['id']}/replies/{b['id']}",
        json={"rsvp_status": "declined"},
    )

    violations = api.get(seating).json()["violations"]
    assert {v["kind"] for v in violations} == {"apart", "declined"}


def test_uninviting_a_guest_frees_their_seat(api, wedding, day, seating):
    table = api.post(f"{seating}/tables", expected=201, json={"capacity": 10}).json()
    guest = invite(api, wedding, day, "Jo")
    api.put(f"{seating}/assignments/{guest['id']}", json={"table_id": table["id"]})
    api.delete(f"/weddings/{wedding['id']}/guests/{guest['id']}/invitations/{day['id']}")
    assert api.get(seating).json()["stats"]["seats_assigned"] == 0


def test_constraints_are_unique_per_pair(api, wedding):
    a, b = add_guest(api, wedding, "A"), add_guest(api, wedding, "B")
    url = f"/weddings/{wedding['id']}/seating-constraints"
    created = api.post(
        url,
        expected=201,
        json={"guest_a_id": a["id"], "guest_b_id": b["id"], "note": "Ex-partners"},
    ).json()
    assert {created["guest_a_name"], created["guest_b_name"]} == {"A Guest", "B Guest"}
    api.post(url, expected=409, json={"guest_a_id": b["id"], "guest_b_id": a["id"]})
    api.post(url, expected=400, json={"guest_a_id": a["id"], "guest_b_id": a["id"]})
    api.delete(f"{url}/{created['id']}")
    assert api.get(url).json() == []


def test_locked_pending_guest_still_counts_when_excluding_pending(api, wedding, day, seating):
    table = api.post(f"{seating}/tables", expected=201, json={"capacity": 2}).json()
    pending = invite(api, wedding, day, "Pending", plus_one=True)
    api.put(
        f"{seating}/assignments/{pending['id']}", json={"table_id": table["id"], "locked": True}
    )
    attending = invite(api, wedding, day, "Yes")
    api.put(
        f"/weddings/{wedding['id']}/events/{day['id']}/replies/{attending['id']}",
        json={"rsvp_status": "attending"},
    )

    result = api.post(f"{seating}/auto-arrange", json={"include_pending": False}).json()
    assert [u["full_name"] for u in result["unplaced"]] == ["Yes Guest"]
    assert result["plan"]["violations"] == []
