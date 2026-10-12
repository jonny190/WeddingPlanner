import { expect, test } from "@playwright/test";
import { Api, openSection, signInAs, unique } from "./helpers";

test("guests are invited to day and evening independently, and seating keeps rivals apart", async ({
  page,
  request,
}) => {
  const email = `${unique("seating")}@example.com`;
  const api = await Api.signUp(request, email);
  const wedding = await api.call("POST", "/weddings", {
    partner_one_name: "Sam",
    partner_two_name: "Alex",
    wedding_date: "2027-06-12",
  });
  const [day, evening] = wedding.events;
  const W = `/weddings/${wedding.id}`;
  const names = ["Ann", "Ben", "Cat", "Dan", "Eve", "Fay"];
  for (const first of names) {
    await api.call("POST", `${W}/guests`, {
      first_name: first,
      last_name: "Guest",
      group_name: first < "D" ? "Family" : "Friends",
      invitations: [{ event_id: day.id, plus_one_allowed: first === "Ann" }],
    });
  }

  await signInAs(page, email);
  await page.goto(`${W}/guests`);

  // Invite Ben to the evening only from the guest table, without touching his day invite.
  // check() also asserts the box is ticked straight after the click (no optimistic flicker).
  await page.getByLabel("Ben Guest invited to Evening Reception").check();
  await expect
    .poll(async () => {
      const guests = await api.call("GET", `${W}/guests`);
      const ben = guests.find((g: any) => g.first_name === "Ben");
      return ben.invitations.map((i: any) => i.event_id).sort();
    })
    .toEqual([day.id, evening.id].sort());
  await expect(page.getByLabel("Ann Guest can bring a guest to Wedding Day")).toBeVisible();

  // Room set-up: three tables of three seats.
  await page.goto(`${W}/seating`);
  await openSection(page, "Room setup");
  await page.getByLabel("Tables", { exact: true }).fill("3");
  await page.getByLabel("Seats each").fill("3");
  await page.getByRole("button", { name: /Create 3 × 3-seat tables/ }).click();
  await expect(page.getByText("Table 3").first()).toBeVisible();

  // Ann and Ben must never share a table.
  await openSection(page, "Seating rules");
  await page.getByRole("combobox", { name: "Guest", exact: true }).click();
  await page.getByRole("option", { name: /Ann Guest/ }).click();
  await page.getByRole("combobox", { name: "Keep away from" }).click();
  await page.getByRole("option", { name: /Ben Guest/ }).click();
  await page.getByRole("button", { name: "Keep them apart" }).click();
  await expect(page.getByText(/Ann Guest/).first()).toBeVisible();

  await page.getByRole("button", { name: "Auto-arrange" }).click();
  await page.getByRole("button", { name: "Arrange seats" }).click();

  await expect
    .poll(async () => (await api.call("GET", `${W}/events/${day.id}/seating`)).stats.guests_unassigned)
    .toBe(0);
  const plan = await api.call("GET", `${W}/events/${day.id}/seating`);
  expect(plan.violations).toEqual([]);
  const tableOf = (first: string) =>
    plan.tables.find((t: any) => t.guests.some((g: any) => g.full_name === `${first} Guest`))?.id;
  expect(tableOf("Ann")).toBeTruthy();
  expect(tableOf("Ann")).not.toEqual(tableOf("Ben"));
  for (const table of plan.tables) expect(table.seats_used).toBeLessThanOrEqual(table.capacity);
});
