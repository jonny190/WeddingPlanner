import { expect, test } from "@playwright/test";
import { Api, signInAs, unique, whatsappTo } from "./helpers";

test("an invitation goes by WhatsApp to a guest's mobile, and the link opens their invitation", async ({
  page,
  browser,
  request,
}) => {
  const email = `${unique("whatsapp")}@example.com`;
  const api = await Api.signUp(request, email);
  const wedding = await api.call("POST", "/weddings", {
    partner_one_name: "Sam",
    partner_two_name: "Alex",
    wedding_date: "2027-06-12",
  });
  const day = wedding.events[0];
  const W = `/weddings/${wedding.id}`;
  // A number the phone library knows as a valid UK mobile (the database is fresh each run).
  const mobile = "07911 123456";
  const jo = await api.call("POST", `${W}/guests`, {
    first_name: "Jo",
    last_name: "Mobile",
    phone: mobile,
    invitations: [{ event_id: day.id }],
  });
  expect(jo.phone).toMatch(/^\+447911/);
  await api.call("POST", `${W}/guests`, {
    first_name: "Pat",
    last_name: "Email",
    email: `${unique("pat")}@example.com`,
    invitations: [{ event_id: day.id }],
  });

  // The couple writes the WhatsApp message and sends to mobiles first, email for the rest.
  await signInAs(page, email);
  await page.goto(`${W}/invitations`);
  await page.getByRole("button", { name: "New draft" }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.getByRole("tab", { name: "Email" }).click();
  await page.getByLabel("WhatsApp message").fill("Hi {{first_name}}, you're invited! {{rsvp_link}}");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();

  await page.getByRole("tab", { name: "Send" }).click();
  await page.getByText("WhatsApp, or email for the rest").click();
  await page.getByRole("button", { name: "Check who will receive it" }).click();
  await expect(page.getByText("2 guests will receive it")).toBeVisible();
  await expect(page.getByText(`WhatsApp, ${jo.phone}`)).toBeVisible();
  await page.getByRole("button", { name: "Send to 2 guests" }).click();
  await page.getByRole("button", { name: /^Send 1 email and 1 WhatsApp message|^Send 1 WhatsApp message and 1 email/ }).click();

  // The worker "sends" it through the file bridge; the message carries Jo's tracked link.
  const [message] = await whatsappTo(jo.phone);
  expect(message.text).toContain("Hi Jo, you're invited!");
  const link = message.text.match(/https?:\/\/\S+\/i\/\S+/)![0];

  const guest = await browser.newPage();
  await guest.goto(new URL(link).pathname);
  await expect(guest).toHaveURL(/\/rsvp\//);
  await guest.getByRole("button", { name: "Open the invitation" }).click();
  await expect(guest.getByText("For Jo Mobile")).toBeVisible();
  await guest.close();

  // Opening a WhatsApp link counts as an open like any other.
  await page.goto(`${W}/replies`);
  const row = page.getByRole("row").filter({ hasText: "Jo Mobile" });
  await expect(row.getByText("Opened, no reply")).toBeVisible();
});
