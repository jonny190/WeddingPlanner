import fs from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { EMAIL_DIR } from "../playwright.config";

export interface SentEmail {
  to: string;
  subject: string;
  text: string;
  html: string | null;
  reply_to: string | null;
}

/** Wait for the worker to deliver emails to `to` (written by the API's "file" email backend). */
export async function emailsTo(to: string, atLeast = 1): Promise<SentEmail[]> {
  let found: SentEmail[] = [];
  await expect
    .poll(
      () => {
        const files = fs.existsSync(EMAIL_DIR) ? fs.readdirSync(EMAIL_DIR).sort() : [];
        found = files
          .map((f) => JSON.parse(fs.readFileSync(path.join(EMAIL_DIR, f), "utf8")) as SentEmail)
          .filter((m) => m.to === to);
        return found.length;
      },
      { timeout: 20_000, message: `waiting for an email to ${to}` },
    )
    .toBeGreaterThanOrEqual(atLeast);
  return found;
}

export function trackedLink(email: SentEmail): string {
  const match = email.text.match(/https?:\/\/\S+\/i\/\S+/);
  if (!match) throw new Error(`No tracked link in email: ${email.text}`);
  return new URL(match[0]).pathname;
}

export function unique(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A signed-in API client for fast test setup (the UI is exercised separately). */
export class Api {
  constructor(
    private request: APIRequestContext,
    public token: string,
    public tenantId: string,
  ) {}

  static async signUp(request: APIRequestContext, email: string, account = "E2E Weddings") {
    const response = await request.post("/api/v1/auth/signup", {
      data: { email, password: "correct-horse", full_name: "E2E Tester", account_name: account },
    });
    expect(response.status(), await response.text()).toBe(201);
    const body = await response.json();
    return new Api(request, body.access_token, body.tenants[0].id);
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}`, "X-Tenant-ID": this.tenantId };
  }

  async call<T = any>(method: string, url: string, data?: unknown): Promise<T> {
    const response = await this.request.fetch(`/api/v1${url}`, {
      method,
      headers: this.headers(),
      data,
    });
    expect(response.ok(), `${method} ${url}: ${await response.text()}`).toBeTruthy();
    return response.status() === 204 ? (undefined as T) : response.json();
  }
}

/** Sign in through the login form. */
export async function signInAs(page: Page, email: string, password = "correct-horse") {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Expand a collapsible <details> section (by its summary text) if it isn't already open. */
export async function openSection(page: Page, title: string) {
  const section = page.locator("details", { has: page.locator("summary", { hasText: title }) });
  await expect(section).toBeVisible();
  if (!(await section.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await section.locator("summary").click();
  }
  await expect(section).toHaveAttribute("open", "");
}
