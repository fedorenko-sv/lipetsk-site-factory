import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/system",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 45_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3023",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "system-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3023",
    url: "http://127.0.0.1:3023",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
