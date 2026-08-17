import { ENV } from "../_core/env";

type Authorization = {
  allowed: boolean;
  reason?: string;
  projectPaused?: boolean;
  accountId?: string;
  email?: string;
  displayName?: string | null;
  dailyLimit?: number;
  globalDailyLimit?: number;
};

type Reservation = {
  allowed: boolean;
  reason?: string;
  duplicate?: boolean;
  personalRemaining?: number;
  siteRemaining?: number;
  used?: number;
  limit?: number;
};

async function requestControl<T>(path: string, input: Record<string, unknown>): Promise<T> {
  if (!ENV.controlServiceToken) throw new Error("Hosted admission control is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(new URL(path, ENV.controlPlaneUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENV.controlServiceToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Admission control returned ${response.status}.`);
    return await response.json() as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Admission control did not respond. No server work was started.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function authorizeHostedUser(email: string): Promise<Authorization> {
  return requestControl<Authorization>("/internal/authorize", { email, projectSlug: "job-matrix" });
}

export function reserveHostedSearch(email: string, reservationId: string): Promise<Reservation> {
  return requestControl<Reservation>("/internal/reserve", {
    email,
    projectSlug: "job-matrix",
    action: "scrape-search",
    reservationId,
  });
}
