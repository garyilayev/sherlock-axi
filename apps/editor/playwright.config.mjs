// End-to-end checks for the editor (Spotlight, EN/HE switch, screenshots).
// Needs a build first: npm run build -w @sherlock/editor && npm run e2e -w @sherlock/editor
import { defineConfig, devices } from '@playwright/test';

const PORT = 4879;

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1536, height: 900 },
  },
  webServer: {
    command: `node e2e/serve.mjs ${PORT}`,
    url: `http://localhost:${PORT}/api/state`,
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
