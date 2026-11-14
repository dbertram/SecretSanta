import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8788",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM
      ? {}
      : { executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome" },
  },
  webServer: {
    command: "python3 -m http.server 8788 --bind 127.0.0.1 --directory public",
    url: "http://127.0.0.1:8788",
    reuseExistingServer: false,
  },
});
