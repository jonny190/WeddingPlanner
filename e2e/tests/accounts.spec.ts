import { expect, test } from "@playwright/test";
import { Api, emailsTo, signInAs, unique } from "./helpers";

test("a couple signs up, creates a wedding, and other accounts can't see it", async ({
  page,
  browser,
  request,
}) => {
  const email = `${unique("couple")}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Sam Taylor");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse");
  await page.getByLabel("Account name").fill("Sam & Alex");
  await page.getByRole("button", { name: "Create account" }).click();

  await page.getByRole("button", { name: "New wedding" }).first().click();
  await page.getByLabel("Partner one").fill("Sam");
  await page.getByLabel("Partner two").fill("Alex");
  await page.getByLabel("Wedding date").fill("2027-06-12");
  await page.getByRole("button", { name: "Create wedding" }).click();

  // The new wedding opens with its day and evening events ready.
  await expect(page).toHaveURL(/\/weddings\/[0-9a-f-]+/);
  await expect(page.getByText("Wedding Day").first()).toBeVisible();
  await expect(page.getByText("Evening Reception").first()).toBeVisible();
  const weddingUrl = page.url();

  // A different account sees nothing and cannot open the wedding directly.
  const otherEmail = `${unique("planner")}@example.com`;
  await Api.signUp(request, otherEmail, "Other Planning Co");
  const other = await browser.newPage();
  await signInAs(other, otherEmail);
  await expect(other.getByRole("button", { name: "New wedding" }).first()).toBeVisible();
  await expect(other.getByText("Sam & Alex")).toHaveCount(0);
  await other.goto(weddingUrl);
  await expect(other.getByText(/not found|doesn.t exist|couldn.t find/i).first()).toBeVisible();
  await other.close();
});

test("a member joins by invitation and can change their password", async ({ page, browser, request }) => {
  const ownerEmail = `${unique("owner")}@example.com`;
  const inviteeEmail = `${unique("invitee")}@example.com`;
  await Api.signUp(request, ownerEmail, "Rosewood Weddings");

  // The owner invites a colleague from the account page.
  await signInAs(page, ownerEmail);
  await page.goto("/account");
  const inviteForm = page.locator("form.add-member");
  await inviteForm.getByLabel("Email").fill(inviteeEmail);
  await inviteForm.getByLabel("Role").selectOption("admin");
  await inviteForm.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(`Invitation emailed to ${inviteeEmail}`)).toBeVisible();
  await expect(page.getByText("Invited, not yet joined")).toBeVisible();

  // The colleague opens the link from the email, creates a login and lands in the account.
  const [email] = await emailsTo(inviteeEmail);
  expect(email.subject).toContain("Rosewood Weddings");
  const link = new URL(email.text.match(/https?:\/\/\S+\/invite\/\S+/)![0]).pathname;
  const invitee = await browser.newPage();
  await invitee.goto(link);
  await expect(invitee.getByText("invited you to join Rosewood Weddings")).toBeVisible();
  await invitee.getByLabel("Your name").fill("Robin Planner");
  await invitee.getByLabel("Choose a password").fill("robin-first-pass");
  await invitee.getByRole("button", { name: "Create login and join" }).click();
  await expect(invitee.getByRole("button", { name: "New wedding" }).first()).toBeVisible();
  await expect(invitee.getByText("Rosewood Weddings").first()).toBeVisible();

  // The link is spent, and the owner now sees them as a member.
  await page.reload();
  await expect(page.getByText("Robin Planner")).toBeVisible();
  await expect(page.getByText("Invited, not yet joined")).toHaveCount(0);

  // They change their password and sign in again with the new one.
  await invitee.goto("/account");
  await invitee.getByLabel("Current password").fill("robin-first-pass");
  await invitee.getByLabel("New password", { exact: true }).fill("robin-second-pass");
  await invitee.getByLabel("Repeat new password").fill("robin-second-pass");
  await invitee.getByRole("button", { name: "Change password" }).click();
  await expect(invitee.getByText("Password changed.")).toBeVisible();
  await invitee.close();

  const again = await browser.newPage();
  await signInAs(again, inviteeEmail, "robin-second-pass");
  await expect(again.getByRole("button", { name: "New wedding" }).first()).toBeVisible();
  await again.close();
});

test("a forgotten password is reset from the emailed link", async ({ page, request }) => {
  const email = `${unique("forgetful")}@example.com`;
  await Api.signUp(request, email, "Forgetful Co");

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgotten your password?" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("a reset link is on its way")).toBeVisible();

  const [message] = await emailsTo(email);
  const link = new URL(message.text.match(/https?:\/\/\S+\/reset-password\/\S+/)![0]).pathname;
  await page.goto(link);
  await page.getByLabel("New password", { exact: true }).fill("a-new-password");
  await page.getByLabel("Repeat new password").fill("a-new-password");
  await page.getByRole("button", { name: "Save and sign in" }).click();
  await expect(page.getByRole("button", { name: "New wedding" }).first()).toBeVisible();
});
