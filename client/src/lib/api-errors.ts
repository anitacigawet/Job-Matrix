import {
  NOT_ADMIN_ERR_MSG,
  ONBOARDING_REQUIRED_ERR_MSG,
  UNAUTHED_ERR_MSG,
} from "@shared/const";
import { TRPCClientError } from "@trpc/client";

export function isUnauthorizedApiError(error: unknown): boolean {
  return error instanceof TRPCClientError && error.message === UNAUTHED_ERR_MSG;
}

export function isForbiddenApiError(error: unknown): boolean {
  return error instanceof TRPCClientError && error.message === NOT_ADMIN_ERR_MSG;
}

export function isOnboardingRequiredApiError(error: unknown): boolean {
  return error instanceof TRPCClientError && error.message === ONBOARDING_REQUIRED_ERR_MSG;
}

export function getFriendlyApiErrorMessage(error: unknown): string {
  if (isUnauthorizedApiError(error)) {
    return "Your session has expired. Please sign in again.";
  }
  if (isOnboardingRequiredApiError(error)) {
    return "Please finish onboarding to continue.";
  }
  if (isForbiddenApiError(error)) {
    return "This action is restricted to the instance owner.";
  }
  if (error instanceof TRPCClientError && error.message) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
