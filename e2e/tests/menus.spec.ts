import { expect, test } from "@playwright/test";
import { Api, signInAs, unique } from "./helpers";

test("the couple sets a menu, a guest picks dishes for two, and the counts add up", async ({
  page,
  browser,
  request,
}) => {
  const email = `${unique("menus")}@example.com`;
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
    invitations: [{ event_id: day.id, plus_one_allowed: true }],
  });
  await api.call("POST", `${W}/events/${day.id}/invitations/mark-sent`, { guest_ids: [guest.id] });

  // The couple writes the menu on the Menus page.
  await signInAs(page, email);
  await page.goto(`${W}/menus`);
  await page.getByRole("button", { name: "Start with starter, main and dessert" }).click();
  await page.getByLabel("Starter dish 1", { exact: true }).fill("Soup");
  await page.getByRole("button", { name: "Add a dish" }).first().click();
  await page.getByLabel("Starter dish 2", { exact: true }).fill("Salad");
  await page.getByLabel("Main dish 1", { exact: true }).fill("Beef");
  await page.getByRole("button", { name: "Add a dish" }).nth(1).click();
  await page.getByLabel("Main dish 2", { exact: true }).fill("Fish");
  await page.getByLabel("Dessert dish 1", { exact: true }).fill("Tart");
  await page.getByRole("button", { name: "Save menu" }).first().click();
  await expect(page.getByText("Menu saved.")).toBeVisible();

  // The guest accepts for two and picks for both on the reply slip.
  const [reply] = await api.call("GET", `${W}/events/${day.id}/replies`);
  const jo = await browser.newPage();
  await jo.goto(`/rsvp/${reply.rsvp_token}`);
  await jo.getByRole("button", { name: "Open the invitation" }).click();
  await expect(jo.getByText("There is a choice of dishes")).toBeVisible();
  await jo.getByText("Joyfully accept").first().click();
  await jo.getByText("Yes, I'll bring someone").click();
  await jo.getByLabel("Their name").fill("Robin");

  // Sending without choosing is caught on the page.
  await jo.getByRole("button", { name: "Send my reply" }).click();
  await expect(jo.getByText("Please choose a dish for every course")).toBeVisible();

  const mine = jo.getByRole("radiogroup", { name: /What would you like\? Starter/ });
  await mine.getByText("Soup").click();
  await jo.getByRole("radiogroup", { name: /What would you like\? Main/ }).getByText("Beef").click();
  await jo.getByRole("radiogroup", { name: /What would you like\? Dessert/ }).getByText("Tart").click();
  await jo.getByRole("radiogroup", { name: /And for Robin\? Starter/ }).getByText("Salad").click();
  await jo.getByRole("radiogroup", { name: /And for Robin\? Main/ }).getByText("Fish").click();
  await jo.getByRole("radiogroup", { name: /And for Robin\? Dessert/ }).getByText("Tart").click();
  await jo.getByRole("button", { name: "Send my reply" }).click();
  await expect(jo.getByText("Thank you, Jo!")).toBeVisible();
  await expect(jo.getByText("Soup, Beef, Tart")).toBeVisible();
  await expect(jo.getByText("Salad, Fish, Tart")).toBeVisible();
  await jo.close();

  // The couple sees the counts and that everyone has chosen.
  await page.reload();
  await expect(page.getByText("Everyone coming has chosen.")).toBeVisible();
  const report = await api.call("GET", `${W}/events/${day.id}/menu/choices`);
  const counts = Object.fromEntries(report.counts.map((c: any) => [c.option_name, c.count]));
  expect(counts).toMatchObject({ Soup: 1, Salad: 1, Beef: 1, Fish: 1, Tart: 2 });
  const row = page.getByRole("row").filter({ hasText: "Jo Guest" });
  await expect(row.getByText("Complete")).toBeVisible();
});
