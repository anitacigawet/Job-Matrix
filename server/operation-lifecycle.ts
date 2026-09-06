import { AsyncLocalStorage } from "node:async_hooks";

type Operation = { generation: number; resetting?: boolean };
const operations = new AsyncLocalStorage<Operation>();
let generation = 0;
let resetting = false;

export class OperationCancelledError extends Error {}

/** Check at the synchronous persistence boundary, not only before an await. */
export function assertOperationActive(): void {
  const operation = operations.getStore();
  if ((operation && operation.generation !== generation) ||
      (resetting && !operation?.resetting)) {
    throw new OperationCancelledError("Operation cancelled because local data was reset");
  }
}

/** Nested calls retain the original generation, including scheduled pipelines. */
export function withWorkspaceOperation<T>(callback: () => T): T {
  assertOperationActive();
  if (operations.getStore()) return callback();
  return operations.run({ generation }, callback);
}

/** Invalidate suspended work before deleting data; reject new work until done. */
export async function resetWorkspace<T>(callback: () => Promise<T>): Promise<T> {
  if (resetting) throw new Error("Local data reset is already running");
  generation++;
  resetting = true;
  try {
    return await operations.run({ generation, resetting: true }, callback);
  } finally {
    resetting = false;
  }
}
