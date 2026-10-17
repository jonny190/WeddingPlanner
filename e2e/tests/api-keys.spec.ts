import { expect, test, type APIRequestContext } from "@playwright/test";
import { Api, signInAs, unique } from "./helpers";

const MCP_HEADERS = {
  Accept: "application/json, text/event-stream",
  "Content-Type": "application/json",
  "MCP-Protocol-Version": "2025-06-18",
};

/** One tool call the way an agent makes it: a single JSON-RPC POST carrying the key. */
async function callTool(request: APIRequestContext, key: string, name: string, args: object = {}) {
  const response = await request.post("/api/mcp", {
    headers: { ...MCP_HEADERS, Authorization: `Bearer ${key}` },
    data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
  });
  return { status: response.status(), body: response.status() === 200 ? await response.json() : null };
}

test("a member creates an API key, an agent uses it within the account, then it is revoked", async ({
  page,
  request,
}) => {
  const email = `${unique("keys")}@example.com`;
  const api = await Api.signUp(request, email, "Keyed Weddings");
  const wedding = await api.call("POST", "/weddings", { partner_one_name: "Sam", partner_two_name: "Alex" });
  const stranger = await Api.signUp(request, `${unique("stranger")}@example.com`, "Elsewhere");

  // Created from the account page; the secret is shown once.
  await signInAs(page, email);
  await page.goto("/account");
  await page.getByLabel("Key name").fill("Hermes");
  await page.getByLabel("Can make changes").check();
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText("Copy your new key now")).toBeVisible();
  const key = (await page.getByTestId("api-key-secret").textContent())!.trim();
  expect(key.startsWith("wp_")).toBeTruthy();
  await expect(page.getByText("Connect Hermes")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Hermes" }).getByText("Can make changes")).toBeVisible();

  // The MCP server answers that key with this account's data, and changes stick.
  const listed = await callTool(request, key, "list_weddings");
  expect(listed.status).toBe(200);
  expect(JSON.stringify(listed.body.result)).toContain(wedding.id);
  const added = await callTool(request, key, "add_guest", {
    wedding_id: wedding.id,
    first_name: "Priya",
    invitations: [{ event_id: wedding.events[0].id, plus_one_allowed: true }],
  });
  expect(added.body.result.isError).toBeFalsy();
  const guests = await api.call("GET", `/weddings/${wedding.id}/guests`);
  expect(guests.map((g: any) => g.first_name)).toEqual(["Priya"]);

  // A key from another account cannot see this wedding, and no key means no tools at all.
  const strangersKey = (await stranger.call("POST", "/tenants/current/api-keys", { name: "x" })).key;
  const peek = await callTool(request, strangersKey, "get_wedding", { wedding_id: wedding.id });
  expect(peek.body.result.isError).toBeTruthy();
  expect((await callTool(request, "wp_nothing", "list_weddings")).status).toBe(401);

  // Revoking it from the page cuts the agent off straight away.
  await page.getByRole("button", { name: "Revoke the key Hermes" }).click();
  await page.getByRole("button", { name: "Revoke key" }).click();
  await expect(page.getByText("No keys yet.")).toBeVisible();
  expect((await callTool(request, key, "list_weddings")).status).toBe(401);
});
