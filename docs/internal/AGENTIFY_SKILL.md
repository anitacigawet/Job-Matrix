# /Agentify: A Blueprint for Agentic Accessibility

This document outlines the methodology used to refactor traditional human-centric web applications into "Agent-Accessible" platforms. Use this blueprint to "Agentify" any React/Tailwind codebase.

---

## Phase 1: Contextual Audit
1.  **Map Route Topology:** Identify every navigable URL and its purpose.
2.  **Identify Async Workflows:** List all long-running tasks (scrapers, LLM calls, batch processing).
3.  **Audit Interactive Elements:** Locate every primary Button, Switch, and Form.
4.  **Semantic Check:** Find all icon-only buttons or interactive `div` elements that lack textual meaning.

## Phase 2: Surgical Injection (The "Agentic Layer")

### 1. Custom Action Hooks (`data-agent-action`)
Inject explicit, unbreakable targets for AI automation.
*   **Naming Convention:** `[verb]-[noun]` (e.g., `run-broad-search`, `save-profile`).
*   **Target:** Apply to `<Button>`, `<a>`, and custom interactive components.

### 2. State Broadcasting (`data-agent-status`)
Broadcast asynchronous state changes to the Accessibility Tree.
*   **Wrappers:** Use `aria-live="polite"` and `aria-atomic="true"` on status text wrappers.
*   **Observer Nodes:** Add `data-agent-status="[context]"` so the agent knows which node to monitor (e.g., `job-scan-progress`).
*   **Progressive Metrics:** Ensure progress bars use `role="progressbar"` with `aria-valuenow`.

### 3. Icon Semantic Enforcement
Force meaningful labels on non-textual UI elements.
*   **Labels:** Every icon-only button MUST have a descriptive `aria-label`.
*   **Roles:** Any interactive non-button element must include `role="button"` and `tabIndex={0}`.

### 4. Data Input Mapping (`data-agent-input`)
Map form fields to the agent's **Personal Intelligence** context to enable zero-knowledge onboarding.
*   **Convention:** `data-agent-input="[context]"` (e.g., `user-city`, `user-education-level`).
*   **Target:** Apply to `<Input>`, `<SelectTrigger>`, `<Textarea>`, and `<Switch>`.

## Phase 3: Concierge prompt + hook reference

Job Matrix originally tried to expose a `AGENT_MANIFEST.md` as a public AI-facing contract. We retired that approach after live testing showed that agents don't need (and aren't reliably consuming) a long manifest. Two artifacts replace it:

1. **`docs/CONCIERGE_PROMPT.md`** — a short, tested copy-paste prompt the user gives to their browser-driving agent. This is the **only** thing the agent receives; it's terse, friendly, and validated end-to-end against a real agent session. Do not pad it with hook documentation — agents discover the hooks through the DOM.
2. **`docs/internal/AGENT_HOOKS_REFERENCE.md`** — a developer reference enumerating every `data-agent-*` hook. For human contributors, not agents. Update in lock-step with the JSX.

---

## Workflow Summary for Skill Generation
To replicate this refactor automatically, an AI tool must:
1.  **Scan the AST** for interactive Radix/UI components and form fields.
2.  **Cross-reference state variables** (e.g., `isLoading`, `isPending`) to loading-spinner UI blocks.
3.  **Inject data attributes** based on component purpose (Action, Status, or Input).
4.  **Auto-wrap log messages** in ARIA-live regions.
5.  **Compile the integration manifest** by extracting the newly injected attributes.

By following this blueprint, any codebase can be seamlessly bridged into the era of autonomous browser agents.
