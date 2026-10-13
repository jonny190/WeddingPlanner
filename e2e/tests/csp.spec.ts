import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { Api, unique } from "./helpers";

// nginx is not part of this suite, so the content security policy it sends is applied here
// by hand to every HTML document, straight from the file the Docker image uses. The test
// then walks the pages with the most moving parts and fails on any policy violation.
const headersFile = path.join(import.meta.dirname, "..", "..", "frontend", "security-headers.conf");
const policy = /Content-Security-Policy "([^"]+)"/.exec(fs.readFileSync(headersFile, "utf8"))?.[1];

test("the content security policy nginx sends does not break the app", async ({ page, request }) => {
  expect(policy, "security-headers.conf should define a Content-Security-Policy").toBeTruthy();

  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  const thirdParty = new Set<string>();
  page.on("request", (req) => {
    const host = new URL(req.url()).hostname;
    if (host !== "localhost" && host !== "127.0.0.1") thirdParty.add(host);
  });
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": policy! } });
  });

  const email = `${unique("csp")}@example.com`;
  const api = await Api.signUp(request, email, "Policy Weddings");
  const wedding = await api.call("POST", "/weddings", {
    partner_one_name: "Sam",
    partner_two_name: "Alex",
    wedding_date: "2027-06-12",
  });
  const day = wedding.events[0];
  const W = `/weddings/${wedding.id}`;
  await api.call("POST", `${W}/guests`, {
    first_name: "Jo",
    last_name: "Guest",
    email: `${unique("jo")}@example.com`,
    invitations: [{ event_id: day.id }],
  });
  const draft = await api.call("POST", `${W}/events/${day.id}/invitation-drafts`, { name: "Main" });
  await api.call("POST", `${W}/events/${day.id}/invitation-drafts/${draft.id}/send`, { audience: "all" });

  // Sign in, the account page, and the invitation editor with its card canvas and email preview.
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill("correct-horse");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto("/account");
  await expect(page.getByText("Invite someone")).toBeVisible();

  await page.goto(`${W}/invitations?draft=${draft.id}`);
  await expect(page.getByRole("tab", { name: "Card" })).toBeVisible();
  await expect(page.getByText("Sam & Alex").first()).toBeVisible();
  await page.getByRole("tab", { name: "Preview" }).click();
  const emailFrame = page.frameLocator("iframe.email-iframe");
  await expect(emailFrame.locator("body")).toContainText("Dear");

  // The guest's page: the designed card, with its typefaces served from this origin.
  const [reply] = await api.call("GET", `${W}/events/${day.id}/replies`);
  await page.goto(`/rsvp/${reply.rsvp_token}`);
  await page.getByRole("button", { name: "Open the invitation" }).click();
  await expect(page.getByText("For Jo Guest")).toBeVisible();
  const scriptFaces = await page.evaluate(async () => (await document.fonts.load("40px 'Great Vibes'")).length);
  expect(scriptFaces, "the card's script typeface should load from the bundled files").toBeGreaterThan(0);

  expect(violations).toEqual([]);
  expect([...thirdParty], "no request should leave the app's own origin").toEqual([]);
});
