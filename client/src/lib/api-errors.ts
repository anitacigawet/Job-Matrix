import { TRPCClientError } from "@trpc/client";

export function getFriendlyApiErrorMessage(error: unknown): string {
  if (error instanceof TRPCClientError && error.message) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
