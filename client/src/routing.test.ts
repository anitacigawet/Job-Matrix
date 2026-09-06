// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Router } from "./App";
import { mountOffline, type OfflineHandlers } from "@/test/offline-react";

vi.mock("./pages/Onboarding", () => ({ default: () => createElement("div", null, "Pending setup") }));

let mounted: Awaited<ReturnType<typeof mountOffline>> | undefined;
afterEach(async () => { await mounted?.dispose(); mounted = undefined; });

const fixtures = (onboardingCompleted: number): OfflineHandlers => ({
  "auth.me": () => ({ id: 1, onboardingCompleted }),
  "settings.getSettings": () => ({}),
  "settings.getLlm": () => ({ activeProvider: "gemini", providers: [{ id: "gemini", hasKey: false, model: "fixture" }] }),
});

it("allows provider setup before onboarding and provides a way back", async () => {
  mounted = await mountOffline(createElement(Router), "/settings", fixtures(0));
  await mounted.waitFor('[data-agent-status="llm-settings-card"]');
  expect(mounted.container.querySelector('[data-agent-status="llm-settings-card"]')).not.toBeNull();
  expect(mounted.container.querySelector('[data-agent-action="return-to-onboarding"]')?.getAttribute("href")).toBe("/onboarding");
  await mounted.click("subnav-scan");
  expect(mounted.container.querySelector('[data-agent-status="llm-settings-card"]')).not.toBeNull();
  expect(mounted.container.textContent).not.toContain("Save Auto-Scan Settings");
});

it.each(["/home", "/jobs", "/applied", "/preferences", "/analytics"])("continues to guard %s during setup", async path => {
  mounted = await mountOffline(createElement(Router), path, fixtures(0));
  expect(mounted.container.textContent).toContain("Pending setup");
  expect(mounted.calls.every(call => call.path === "auth.me")).toBe(true);
});

it("preserves full settings access after onboarding", async () => {
  mounted = await mountOffline(createElement(Router), "/settings", fixtures(1));
  await mounted.click("subnav-scan");
  expect(mounted.container.textContent).toContain("Save Auto-Scan Settings");
  expect(mounted.container.querySelector('[data-agent-action="return-to-onboarding"]')).toBeNull();
});
