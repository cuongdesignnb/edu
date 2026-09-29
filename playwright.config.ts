import { defineConfig } from "@playwright/test";

// Uses the Microsoft Edge already installed on this machine (no browser download).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-results.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: "msedge",
    viewport: { width: 1448, height: 1086 },
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    reducedMotion: "reduce",
  },
});
