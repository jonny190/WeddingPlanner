import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the real web app against a real API and email worker.
// `npm test` starts both automatically (see serve_api.py).
const here = import.meta.dirname;
const output = path.join(here, ".output");
const API_PORT = 8100;
const WEB_PORT = 4173;
// Python with the backend's dependencies; override locally with E2E_PYTHON=/path/to/python
const python = process.env.E2E_PYTHON ?? "uv run --project ../backend python";

export const EMAIL_DIR = path.join(output, "emails");

export default defineConfig({
  testDir: "./tests",
  outputDir: path.join(output, "results"),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One shared server and outbox, so run serially.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: path.join(output, "report") }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `${python} serve_api.py`,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      timeout: 120_000,
      stdout: "pipe",
      env: {
        E2E_API_PORT: String(API_PORT),
        DATABASE_URL: `sqlite:///${path.join(output, "e2e.db")}`,
        EMAIL_BACKEND: "file",
        EMAIL_FILE_DIR: EMAIL_DIR,
        MEDIA_ROOT: path.join(output, "media"),
        PUBLIC_APP_URL: `http://localhost:${WEB_PORT}`,
        SECRET_KEY: "e2e-secret-key-that-is-at-least-32-bytes",
        WORKER_POLL_INTERVAL_SECONDS: "0.3",
      },
    },
    {
      command: `cd ../frontend && npm run build && npx vite preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 180_000,
      env: { VITE_API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
