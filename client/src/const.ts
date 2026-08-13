// Self-hosted single-user mode — no OAuth flow.
// getLoginUrl() returns the home page so any legacy callers redirect harmlessly.
export const getLoginUrl = (_inviteCode?: string): string => "/";
