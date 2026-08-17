export type HostedReservation = {
  allowed: boolean;
  reason?: string;
  duplicate?: boolean;
  personalRemaining?: number;
  siteRemaining?: number;
};

export type HostedSearchOutcome<T> =
  | { kind: "denied"; reservation: HostedReservation }
  | { kind: "duplicate"; reservation: HostedReservation }
  | { kind: "executed"; reservation: HostedReservation; value: T };

const DEFAULT_MAX_SCRAPE_WAITERS = 6;
const DEFAULT_MAX_AI_OPERATIONS = 2;

/**
 * Process-local capacity control for the fixed hosted origin.
 *
 * Durable daily accounting remains in ScootSolute Control. This coordinator
 * closes the separate in-process boundaries: one pending search per account,
 * reservation before queue entry, one scraper at a time, and bounded AI work.
 */
export class HostedWorkCoordinator {
  private scrapeActive = false;
  private readonly scrapeWaiters: Array<() => void> = [];
  private readonly scrapeUsers = new Set<number>();
  private pendingReservations = 0;
  private readonly aiUsers = new Set<number>();
  private aiActive = 0;

  constructor(
    private readonly maxScrapeWaiters = DEFAULT_MAX_SCRAPE_WAITERS,
    private readonly maxAiOperations = DEFAULT_MAX_AI_OPERATIONS,
  ) {}

  private scrapeCapacityUsed(): number {
    return (this.scrapeActive ? 1 : 0) + this.scrapeWaiters.length + this.pendingReservations;
  }

  async runSearch<T>(
    userId: number,
    reserve: () => Promise<HostedReservation>,
    operation: () => Promise<T>,
  ): Promise<HostedSearchOutcome<T>> {
    if (this.scrapeUsers.has(userId)) {
      throw new Error("Only one search can be active or waiting for your account at a time. No search allowance was used.");
    }
    if (this.scrapeCapacityUsed() >= this.maxScrapeWaiters + 1) {
      throw new Error("Job Matrix is already handling several searches. Try again after one finishes; no search allowance was used.");
    }

    // Hold at most one short admission check per account. This prevents an
    // over-quota account from filling all six long-lived queue positions.
    this.scrapeUsers.add(userId);
    this.pendingReservations += 1;
    let reservationPending = true;
    try {
      const reservation = await reserve();
      this.pendingReservations -= 1;
      reservationPending = false;

      if (!reservation.allowed) return { kind: "denied", reservation };
      if (reservation.duplicate) return { kind: "duplicate", reservation };

      await this.acquireScrapeSlot();
      try {
        return { kind: "executed", reservation, value: await operation() };
      } finally {
        this.releaseScrapeSlot();
      }
    } finally {
      if (reservationPending) {
        this.pendingReservations -= 1;
      }
      this.scrapeUsers.delete(userId);
    }
  }

  async runAi<T>(userId: number, operation: () => Promise<T>): Promise<T> {
    if (this.aiUsers.has(userId)) {
      throw new Error("An AI operation is already running for your account.");
    }
    if (this.aiActive >= this.maxAiOperations) {
      throw new Error("Job Matrix is already handling the maximum number of AI operations. Try again after one finishes.");
    }
    this.aiUsers.add(userId);
    this.aiActive += 1;
    try {
      return await operation();
    } finally {
      this.aiActive -= 1;
      this.aiUsers.delete(userId);
    }
  }

  private async acquireScrapeSlot(): Promise<void> {
    if (!this.scrapeActive) {
      this.scrapeActive = true;
      return;
    }
    await new Promise<void>(resolve => this.scrapeWaiters.push(resolve));
  }

  private releaseScrapeSlot(): void {
    const next = this.scrapeWaiters.shift();
    if (next) next();
    else this.scrapeActive = false;
  }

  snapshot() {
    return {
      scrapeActive: this.scrapeActive,
      scrapeWaiters: this.scrapeWaiters.length,
      pendingReservations: this.pendingReservations,
      scrapeUsers: this.scrapeUsers.size,
      aiActive: this.aiActive,
      aiUsers: this.aiUsers.size,
    };
  }
}

export const hostedWorkCoordinator = new HostedWorkCoordinator();
