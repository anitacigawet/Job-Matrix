import { act, createElement, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { observable } from "@trpc/server/observable";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { trpc } from "@/lib/trpc";
import { SubNav, SubNavProvider } from "@/components/SubNav";

export type OfflineHandlers = Record<string, (input: any) => unknown>;

export async function settle() {
  // Let actual React Query notifications and React effects complete.
  for (let index = 0; index < 3; index++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  }
}

export async function mountOffline(node: ReactNode, path: string, handlers: OfflineHandlers) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLElement.prototype.scrollTo = () => {};
  const location = memoryLocation({ path });
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const calls: { path: string; input: unknown }[] = [];
  const client = trpc.createClient({ links: [() => ({ op }) => observable(observer => {
    calls.push({ path: op.path, input: op.input });
    Promise.resolve().then(() => {
      if (!handlers[op.path]) throw new Error(`Unexpected offline procedure: ${op.path}`);
      return handlers[op.path](op.input);
    }).then(data => {
      observer.next({ result: { data } });
      observer.complete();
    }, error => observer.error(error));
    return () => {};
  })] });
  const container = document.createElement("div");
  document.body.append(container);
  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(trpc.Provider, { client, queryClient: queries, children:
      createElement(QueryClientProvider, { client: queries },
        createElement(Router, { hook: location.hook, children:
          createElement(SubNavProvider, { children: createElement(Fragment, null, createElement(SubNav), node) }) })) }));
  });
  await settle();
  return {
    container, calls, queries, location,
    async waitFor(selector: string) {
      const deadline = Date.now() + 2000;
      while (!container.querySelector(selector) && Date.now() < deadline) await settle();
      if (!container.querySelector(selector)) throw new Error(`Missing content: ${selector}; ${container.textContent}`);
    },
    async click(action: string) {
      const button = document.querySelector<HTMLElement>(`[data-agent-action="${action}"]`);
      if (!button) throw new Error(`Missing action: ${action}`);
      await act(async () => button.click());
      await settle();
    },
    async dispose() {
      await act(async () => root.unmount());
      queries.clear();
      container.remove();
    },
  };
}
