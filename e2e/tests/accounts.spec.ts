import { expect, test } from "@playwright/test";
import { Api, signInAs, unique } from "./helpers";

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
