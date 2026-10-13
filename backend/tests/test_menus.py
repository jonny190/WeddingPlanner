"""Food menus per event, and what guests and their plus-ones choose."""

import csv
import io

import pytest

from tests.conftest import add_guest, sign_up


@pytest.fixture
def menu_url(wedding, day):
    return f"/weddings/{wedding['id']}/events/{day['id']}/menu"


@pytest.fixture
def menu(api, menu_url):
    """A two-course menu for the day."""
    return api.put(
        menu_url,
        json={
            "courses": [
                {
                    "name": "Starter",
                    "options": [{"name": "Soup"}, {"name": "Salad", "description": "Vegan"}],
                },
                {"name": "Main", "options": [{"name": "Beef"}, {"name": "Fish"}]},
            ]
        },
    ).json()


@pytest.fixture
def jo(api, wedding, day):
    guest = add_guest(
        api,
        wedding,
        "Jo",
        email="jo@example.com",
        invitations=[{"event_id": day["id"], "plus_one_allowed": True}],
    )
    api.post(
        f"/weddings/{wedding['id']}/events/{day['id']}/invitations/mark-sent",
        json={"guest_ids": [guest["id"]]},
    )
    return guest


def ids(menu):
    """{course name: (course id, {option name: option id})}"""
    return {
        c["name"]: (c["id"], {o["name"]: o["id"] for o in c["options"]}) for c in menu["courses"]
    }


def test_menu_is_saved_in_order_and_edits_keep_ids(api, menu_url, menu):
    assert [c["name"] for c in menu["courses"]] == ["Starter", "Main"]
    assert [o["name"] for o in menu["courses"][0]["options"]] == ["Soup", "Salad"]
    assert menu["courses"][0]["options"][1]["description"] == "Vegan"

    starter, main = menu["courses"]
    # Rename a dish and add a course, keeping the existing ids; drop one dish.
    updated = api.put(
        menu_url,
        json={
            "courses": [
                {
                    "id": starter["id"],
                    "name": "To start",
                    "options": [{"id": starter["options"][0]["id"], "name": "Leek soup"}],
                },
                {"id": main["id"], "name": "Main", "options": main["options"]},
                {"name": "Dessert", "options": [{"name": "Tart"}]},
            ]
        },
    ).json()
    assert [c["name"] for c in updated["courses"]] == ["To start", "Main", "Dessert"]
    assert updated["courses"][0]["id"] == starter["id"]
    assert [o["name"] for o in updated["courses"][0]["options"]] == ["Leek soup"]
    assert updated["courses"][0]["options"][0]["id"] == starter["options"][0]["id"]
    assert api.get(menu_url).json() == updated

    # An empty menu removes everything.
    assert api.put(menu_url, json={"courses": []}).json()["courses"] == []


def test_a_course_needs_at_least_one_dish(api, menu_url):
    api.put(menu_url, expected=422, json={"courses": [{"name": "Starter", "options": []}]})


def test_guest_sees_the_menu_and_must_choose_when_attending(client, api, wedding, day, menu, jo):
    token = jo["rsvp_token"]
    view = client.get(f"/api/v1/public/rsvp/{token}").json()
    [event] = view["events"]
    assert [c["name"] for c in event["menu"]] == ["Starter", "Main"]
    assert event["menu_choices"] == {"guest": {}, "plus_one": {}}
    by_name = ids(menu)
    starter_id, starters = by_name["Starter"]
    main_id, mains = by_name["Main"]

    # Accepting without choosing is refused, with a clear message.
    refused = client.post(
        f"/api/v1/public/rsvp/{token}",
        json={"responses": [{"event_id": day["id"], "attending": True}]},
    )
    assert refused.status_code == 400
    assert refused.json()["code"] == "menu_choice_required"
    assert "starter" in refused.json()["detail"].lower()

    # Bringing someone means choosing for them too.
    half = client.post(
        f"/api/v1/public/rsvp/{token}",
        json={
            "responses": [
                {
                    "event_id": day["id"],
                    "attending": True,
                    "plus_one_attending": True,
                    "plus_one_name": "Pat",
                    "menu_choices": {
                        "guest": {starter_id: starters["Soup"], main_id: mains["Beef"]},
                        "plus_one": {starter_id: starters["Salad"]},
                    },
                }
            ]
        },
    )
    assert half.status_code == 400 and "guest's main" in half.json()["detail"]

    done = client.post(
        f"/api/v1/public/rsvp/{token}",
        json={
            "responses": [
                {
                    "event_id": day["id"],
                    "attending": True,
                    "plus_one_attending": True,
                    "plus_one_name": "Pat",
                    "menu_choices": {
                        "guest": {starter_id: starters["Soup"], main_id: mains["Beef"]},
                        "plus_one": {starter_id: starters["Salad"], main_id: mains["Fish"]},
                    },
                }
            ]
        },
    )
    assert done.status_code == 200, done.text
    choices = done.json()["events"][0]["menu_choices"]
    assert choices["guest"] == {starter_id: starters["Soup"], main_id: mains["Beef"]}
    assert choices["plus_one"] == {starter_id: starters["Salad"], main_id: mains["Fish"]}

    # The couple's report counts both of them.
    report = api.get(f"/weddings/{wedding['id']}/events/{day['id']}/menu/choices").json()
    counts = {(c["course_name"], c["option_name"]): c["count"] for c in report["counts"]}
    assert counts == {
        ("Starter", "Soup"): 1,
        ("Starter", "Salad"): 1,
        ("Main", "Beef"): 1,
        ("Main", "Fish"): 1,
    }
    assert report["people_still_to_choose"] == 0
    [row] = report["rows"]
    assert row["full_name"] == "Jo Guest" and row["complete"] is True

    # Declining clears the choices.
    client.post(
        f"/api/v1/public/rsvp/{token}",
        json={"responses": [{"event_id": day["id"], "attending": False}]},
    )
    report = api.get(f"/weddings/{wedding['id']}/events/{day['id']}/menu/choices").json()
    assert all(c["count"] == 0 for c in report["counts"])


def test_choices_must_be_dishes_on_this_menu(client, api, wedding, day, evening, menu, jo):
    token = jo["rsvp_token"]
    starter_id, starters = ids(menu)["Starter"]
    main_id, mains = ids(menu)["Main"]
    wrong_course = client.post(
        f"/api/v1/public/rsvp/{token}",
        json={
            "responses": [
                {
                    "event_id": day["id"],
                    "attending": True,
                    "menu_choices": {
                        "guest": {starter_id: mains["Beef"], main_id: mains["Beef"]},
                    },
                }
            ]
        },
    )
    assert wrong_course.status_code == 400
    assert wrong_course.json()["code"] == "menu_mismatch"


def test_couple_can_record_choices_and_export_the_caterers_list(
    client, api, wedding, day, menu, jo
):
    starter_id, starters = ids(menu)["Starter"]
    main_id, mains = ids(menu)["Main"]
    base = f"/weddings/{wedding['id']}/events/{day['id']}"

    # Not attending yet: nothing to choose.
    api.put(f"{base}/menu/choices/{jo['id']}", expected=400, json={"guest": {}})

    api.put(
        f"{base}/replies/{jo['id']}",
        json={"rsvp_status": "attending", "plus_one_attending": True, "plus_one_name": "Pat"},
    )
    # The couple may leave gaps when recording by phone.
    row = api.put(
        f"{base}/menu/choices/{jo['id']}",
        json={"guest": {starter_id: starters["Soup"]}, "plus_one": {main_id: mains["Fish"]}},
    ).json()
    assert row["complete"] is False
    report = api.get(f"{base}/menu/choices").json()
    assert report["people_still_to_choose"] == 2

    row = api.put(
        f"{base}/menu/choices/{jo['id']}",
        json={
            "guest": {starter_id: starters["Soup"], main_id: mains["Beef"]},
            "plus_one": {starter_id: starters["Salad"], main_id: mains["Fish"]},
        },
    ).json()
    assert row["complete"] is True

    export = api.get(f"{base}/menu/choices/export")
    assert export.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(export.text)))
    assert [(r["name"], r["with"], r["Starter"], r["Main"]) for r in rows] == [
        ("Jo Guest", "", "Soup", "Beef"),
        ("Pat", "Jo Guest", "Salad", "Fish"),
    ]

    # Recording them as not coming after all takes their dishes off the list.
    api.put(f"{base}/replies/{jo['id']}", json={"rsvp_status": "declined"})
    assert api.get(f"{base}/menu/choices").json()["counts"][0]["count"] == 0


def test_menus_are_private_to_the_account(client, api, menu_url, menu):
    other = sign_up(client, "other@example.com", "Other")
    other.get(menu_url, expected=404)
    other.put(menu_url, expected=404, json={"courses": []})
