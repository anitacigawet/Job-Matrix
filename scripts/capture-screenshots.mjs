import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.JOB_MATRIX_SCREENSHOT_URL ?? "http://127.0.0.1:3000";
const outputDir = path.resolve("docs", "screenshots");
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const page = await context.newPage();

async function open(route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
}

await open("/");
await page.screenshot({
  path: path.join(outputDir, "welcome.png"),
  fullPage: false,
});

await open("/jobs");
await page.locator("text=Search Criteria & AI Filters").waitFor();
await page.screenshot({
  path: path.join(outputDir, "dashboard.png"),
  fullPage: false,
});

const applyButton = page.getByRole("button", { name: "Apply with AI" }).first();
await applyButton.scrollIntoViewIfNeeded();
await applyButton.click();
await page.locator('[data-agent-status="application-assistant-packet"]').waitFor();
await page.screenshot({
  path: path.join(outputDir, "guided-application.png"),
  fullPage: false,
});

await browser.close();
console.log(`Captured Job Matrix screenshots in ${outputDir}`);
