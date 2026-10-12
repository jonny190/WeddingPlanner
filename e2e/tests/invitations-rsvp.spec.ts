import { expect, test } from "@playwright/test";
import { Api, emailsTo, signInAs, trackedLink, unique } from "./helpers";

test("send designed invitations, track who opened them, and collect RSVPs", async ({
  page,
  browser,
  request,
}) => {
  const email = `${unique("invites")}@example.com`;
  const api = await Api.signUp(request, email);
  const wedding = await api.call("POST", "/weddings", {
    partner_one_name: "Sam",
    partner_two_name: "Alex",
    wedding_date: "2027-06-12",
  });
  const day = wedding.events[0];
  const W = `/weddings/${wedding.id}`;
  const replier = `${unique("jo")}@example.com`;
  const opener = `${unique("pat")}@example.com`;
  await api.call("POST", `${W}/guests`, {
    first_name: "Jo", last_name: "Replier", email: replier,
    invitations: [{ event_id: day.id, plus_one_allowed: true }],
  });
  await api.call("POST", `${W}/guests`, {
    first_name: "Pat", last_name: "Opener", email: opener,
    invitations: [{ event_id: day.id }],
  });

  // The couple creates a draft (it starts with a designed card) and sends it.
  await signInAs(page, email);
  await page.goto(`${W}/invitations`);
  await page.getByRole("button", { name: "New draft" }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("tab", { name: "Card" })).toBeVisible();
  await expect(page.getByText("Sam & Alex").first()).toBeVisible();

  await page.getByRole("tab", { name: "Send" }).click();
  await page.getByRole("button", { name: "Check who will receive it" }).click();
  await page.getByRole("button", { name: "Send to 2 guests" }).click();
  await page.getByRole("button", { name: "Send 2 emails" }).click();

  // The worker delivers personalised emails, each with its own tracked link.
  const [joEmail] = await emailsTo(replier);
  const [patEmail] = await emailsTo(opener);
  expect(joEmail.subject).toBe("You're invited to the wedding of Sam & Alex");
  expect(joEmail.text).toContain("Dear Jo,");
  expect(trackedLink(joEmail)).not.toEqual(trackedLink(patEmail));

  // Jo opens the link, sees the card, and accepts with a plus-one.
  const jo = await browser.newPage();
  await jo.goto(trackedLink(joEmail));
  await expect(jo).toHaveURL(/\/rsvp\//);
  await expect(jo.getByText("For Jo Replier")).toBeVisible();
  await jo.getByText("Joyfully accept").first().click();
  await jo.getByText("Yes, I'll bring someone").click();
  await jo.getByLabel("Their name").fill("Robin");
  await jo.getByRole("button", { name: "Send my reply" }).click();
  await expect(jo.getByText("Thank you, Jo!")).toBeVisible();
  await jo.close();

  // Pat opens the link but never replies.
  const pat = await browser.newPage();
  await pat.goto(trackedLink(patEmail));
  await expect(pat.getByText("For Pat Opener")).toBeVisible();
  await pat.close();

  // The couple can see exactly who opened their invitation without replying.
  await page.goto(`${W}/replies`);
  const nudge = page.getByRole("region", { name: "Opened but not replied" });
  await expect(nudge).toContainText("1");
  const patRow = page.getByRole("row").filter({ hasText: "Pat Opener" });
  await expect(patRow.getByText("Opened, no reply")).toBeVisible();
  const joRow = page.getByRole("row").filter({ hasText: "Jo Replier" });
  await expect(joRow.getByText("Attending")).toBeVisible();
  await expect(joRow.getByText("Robin")).toBeVisible();

  const summary = await api.call("GET", `${W}/events/${day.id}/replies/summary`);
  expect(summary).toMatchObject({ attending: 1, opened: 2, opened_no_reply: 1, confirmed_headcount: 2 });
});
