import { expect, test } from "@playwright/test";
import { Api, signInAs, unique } from "./helpers";

test("a tracked venue, once chosen for the day, reaches the guest's page and calendar", async ({
  page,
  browser,
  request,
}) => {
  const email = `${unique("venues")}@example.com`;
  const api = await Api.signUp(request, email);
  const wedding = await api.call("POST", "/weddings", {
    partner_one_name: "Sam",
    partner_two_name: "Alex",
    wedding_date: "2027-06-12",
  });
  const day = wedding.events[0];
  const W = `/weddings/${wedding.id}`;
  const guest = await api.call("POST", `${W}/guests`, {
    first_name: "Jo",
    last_name: "Guest",
    invitations: [{ event_id: day.id }],
  });
  await api.call("POST", `${W}/events/${day.id}/invitations/mark-sent`, { guest_ids: [guest.id] });

  // The couple adds a venue with its price and a contact, then chooses it for the day.
  await signInAs(page, email);
  await page.goto(`${W}/venues`);
  await page.getByRole("button", { name: "Add the first venue" }).click();
  await page.getByLabel("Venue name").fill("Hartwell Manor");
  await page.getByLabel("Status").selectOption("shortlisted");
  await page.getByLabel("Address").fill("Hartwell Lane, Cotswolds, GL54 1AA");
  await page.getByLabel("Hire price").fill("6500");
  await page.getByLabel("Per head").fill("95");
  await page.getByRole("button", { name: "Add a contact" }).click();
  await page.getByLabel("Contact 1 name").fill("Priya Shah");
  await page.getByRole("group", { name: "Contact 1" }).getByLabel("Role").fill("Events coordinator");
  await page.getByRole("dialog").getByRole("button", { name: "Add venue", exact: true }).click();

  const card = page.getByRole("article", { name: "Hartwell Manor" });
  await expect(card).toContainText("Shortlisted");
  await expect(card).toContainText("Hire £6,500.00");
  await expect(card).toContainText("Priya Shah");
  await card.getByRole("button", { name: "Use for Wedding Day" }).click();
  await expect(card.getByRole("button", { name: "Venue for Wedding Day" })).toBeVisible();

  const [event] = (await api.call("GET", `${W}/events`)).filter((e: any) => e.id === day.id);
  expect(event.venue_name).toBe("Hartwell Manor");

  // The guest sees the venue and can add the day, with its address, to their calendar.
  const jo = await browser.newPage();
  await jo.goto(`/rsvp/${guest.rsvp_token}`);
  await jo.getByRole("button", { name: "Open the invitation" }).click();
  await expect(jo.getByText("Hartwell Lane, Cotswolds, GL54 1AA").first()).toBeVisible();
  const icsHref = await jo.locator('a[href*="calendar.ics"]').first().getAttribute("href");
  expect(icsHref).toBeTruthy();
  const ics = await (await request.get(new URL(icsHref!, jo.url()).toString())).text();
  expect(ics).toContain("LOCATION:Hartwell Manor\\, Hartwell Lane\\, Cotswolds\\, GL54 1AA");
  await jo.close();
});
