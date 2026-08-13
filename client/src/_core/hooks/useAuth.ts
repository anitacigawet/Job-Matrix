import { trpc } from "@/lib/trpc";
import { useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

/**
 * Self-hosted, single-user shim.
 * Always returns the local user — no auth, no redirects.
 */
export function useAuth(_options?: UseAuthOptions) {
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const state = useMemo(
    () => ({
      user: meQuery.data ?? null,
      loading: meQuery.isLoading,
      error: meQuery.error ?? null,
      isAuthenticated: true,
    }),
    [meQuery.data, meQuery.error, meQuery.isLoading]
  );

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout: async () => {
      /* no-op — nothing to log out of */
    },
  };
}
