import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.JOB_MATRIX_SCREENSHOT_URL ?? "http://127.0.0.1:3000";
const expectedOrigin = new URL(baseUrl).origin;
const outputDir = path.resolve("docs", "screenshots");
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const externalRequests = new Set();
const browserErrors = [];

context.on("request", request => {
  const url = new URL(request.url());
  if (["http:", "https:"].includes(url.protocol) && url.origin !== expectedOrigin) {
    externalRequests.add(request.url());
  }
});

function monitorPage(target) {
  target.on("pageerror", error => browserErrors.push(error.message));
  target.on("console", message => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
}

context.on("page", monitorPage);
const page = await context.newPage();

async function open(route) {
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  assert(response?.ok(), `${route} returned HTTP ${response?.status() ?? "no response"}`);
  await page.locator('[data-agent-status="showroom-mode"]').waitFor();
  await page.waitForTimeout(500);
}

await open("/");
await page.getByText("Escape the noise.", { exact: true }).waitFor();
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

const jobSearch = page.getByPlaceholder("Search by title, company, or location...");
await jobSearch.fill("Documentation");
await page.getByText("Documentation Coordinator", { exact: true }).waitFor();
await jobSearch.fill("");

const applyButton = page.getByRole("button", { name: "Apply with AI" }).first();
await applyButton.scrollIntoViewIfNeeded();
await applyButton.click();
await page.locator('[data-agent-status="application-assistant-packet"]').waitFor();
await page.screenshot({
  path: path.join(outputDir, "guided-application.png"),
  fullPage: false,
});

const employerPagePromise = context.waitForEvent("page");
await page.locator('[data-agent-action^="open-guided-application-"]').click();
const employerPage = await employerPagePromise;
await employerPage.waitForLoadState("networkidle");
assert.equal(new URL(employerPage.url()).origin, expectedOrigin, "Application form left the showroom origin");
await employerPage.locator('[data-agent-status="showroom-employer-posting"]').waitFor();
await employerPage.locator('[data-agent-action="showroom-review-application"]').click();
await employerPage.locator('[data-agent-status="showroom-application-final-review"]').waitFor();
assert.equal(
  await employerPage.locator('[data-agent-action="showroom-final-submit-disabled"]').isDisabled(),
  true,
  "The fictional employer form exposed an enabled final-submit button",
);
await employerPage.close();
await page.keyboard.press("Escape");

await page.locator('[data-agent-action="run-new-scan"]').click();
await page.getByText("Global Search Complete!", { exact: true }).waitFor();

const routeChecks = [
  ["/home", "Data Sources"],
  ["/applied", "Applied Jobs"],
  ["/preferences", "Job Preferences"],
  ["/analytics", "Analytics"],
  ["/settings", "Settings"],
];

for (const [route, heading] of routeChecks) {
  await open(route);
  await page.getByRole("heading", { name: heading, exact: true }).waitFor();
}

await page.locator('[data-agent-action="subnav-automation"]').click();
const gmailCard = page.locator('[data-agent-status="gmail-connection"]');
await gmailCard.waitFor();
await gmailCard.getByRole("button", { name: "Disconnect" }).click();
await gmailCard.getByText("Not connected", { exact: true }).waitFor();

const gmailPagePromise = context.waitForEvent("page");
await gmailCard.getByRole("button", { name: "Connect Gmail" }).click();
const gmailPage = await gmailPagePromise;
await gmailPage.waitForLoadState("networkidle");
assert.equal(new URL(gmailPage.url()).origin, expectedOrigin, "Gmail simulation left the showroom origin");
await gmailPage.locator('[data-agent-status="showroom-gmail-connected"]').waitFor();
await gmailCard.getByText("Connected: jordan@example.com", { exact: true }).waitFor();
await gmailPage.close();

assert.deepEqual(
  [...externalRequests],
  [],
  `Showroom made external requests:\n${[...externalRequests].join("\n")}`,
);
assert.deepEqual(
  browserErrors,
  [],
  `Showroom emitted browser errors:\n${browserErrors.join("\n")}`,
);

await browser.close();
console.log(`Captured screenshots, seven showroom routes, and guarded application and Gmail workflows in ${outputDir}`);
