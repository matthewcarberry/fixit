import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const dataDir = path.join(os.tmpdir(), `fixit-e2e-${Date.now()}`);
const port = 8099;

export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: 1,
  // The tests share one server and build on each other, so a retry would start from the wrong state.
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node ../server/dist/index.js",
    port,
    reuseExistingServer: false,
    env: {
      PORT: String(port),
      FIXIT_DATA_DIR: dataDir,
      FIXIT_WEB_DIR: path.resolve("../web/dist"),
      FIXIT_TRUST_PROXY: "false",
    },
  },
});
