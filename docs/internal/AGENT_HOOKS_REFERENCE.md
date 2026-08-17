# Agent Hooks Reference

A developer reference for Job Matrix's `data-agent-*` hook system. This file enumerates every action hook, status hook, and form input hook present in the UI.

It exists for **human contributors** who want to understand or extend the agentic surface. AI agents driving Job Matrix on a user's behalf do **not** read this file — they discover the hooks through the DOM as they navigate. The agent's instructions live in [`docs/CONCIERGE_PROMPT.md`](../CONCIERGE_PROMPT.md). For the design philosophy that produced the hooks in the first place, see [`VISION.md`](../../VISION.md).

If you remove or rename a hook, update this file in the same commit — it's the canonical inventory of what the UI exposes.

---

## 0. Hook conventions

- **`data-agent-action="[verb]-[noun]"`** — interactive elements (buttons, links). Stable click targets.
- **`data-agent-status="[context]"`** — observable state nodes. Many also use `aria-live="polite"` + `aria-atomic="true"` so changes announce automatically. Wait on these for async completion.
- **`data-agent-input="[context]"`** — form fields you populate (Input, SelectTrigger, Textarea, Switch, Checkbox).
- **`data-agent-value="[context]"`** — a human-readable saved value supplied to an agent; read-only, never a hidden command channel.
- **Parameterized hooks** are written as `[verb]-[noun]-{param}` in this manifest (e.g. `toggle-title-{id}`). The actual rendered value substitutes the param.

If you find an interactive element without a hook, treat that as a documentation bug — add one and update this file rather than leave the page un-instrumented.

---

## 1. Routes

| Path                   | Purpose                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                    | Landing / system hub (entry point, links to admin, settings, debug)                                                                                                       |
| `/onboarding`          | First-run profile setup                                                                                                                                                   |
| `/jobs`                | Main dashboard — search, filter, AI-analyze, score                                                                                                                        |
| `/home`                | Platforms — choose job sources and inspect source health                                                                                                                  |
| `/applied`             | Applications tracker (Applied → Interview → Offer pipeline)                                                                                                               |
| `/preferences`         | User profile (location, education, experience, skills, salary)                                                                                                            |
| `/preferences#presets` | Saved search presets — now a sub-tab of `/preferences` (the standalone `/presets` route was retired). Reach via TopNav → Preferences, then click the **Presets** sub-tab. |
| `/analytics`           | Charts: fit score distribution, platform breakdown, scan history                                                                                                          |
| `/settings`            | LLM provider, data sources, notifications, auto-scan, integrations, appearance, and local data                                                                            |
| `/config-debug`        | Configuration debug viewer (read-only view of derived profile / search criteria / filter rules)                                                                           |

---

## 2. Action hooks (`data-agent-action`)

### Global / system

| Hook                       | Purpose                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `landing-continue`         | Enter the dashboard from the landing page                                                                                                       |
| `go-to-landing`            | Open the landing page from the Job Matrix brand button in the global TopNav.                                                                    |
| `go-to-dashboard`          | Generic "back to dashboard" navigation                                                                                                          |
| `go-to-settings-global`    | Open the Settings page. Surfaced in the global TopNav, the dashboard's missing-key warning banner, and the Landing page.                        |
| `go-to-platforms`          | Open the Platforms page (`/home`) — choose which job sources are enabled. Lives in the global TopNav.                                           |
| `go-to-debug-config`       | Open the configuration debug viewer (`/config-debug`)                                                                                           |
| `go-to-preferences`        | Global TopNav → `/preferences` (also used by dashboard empty states / criteria card)                                                            |
| `go-to-applied`            | Global TopNav → `/applied`                                                                                                                      |
| `go-to-analytics`          | Global TopNav → `/analytics`                                                                                                                    |
| `back-to-dashboard`        | Return to dashboard from any sub-page                                                                                                           |
| `open-appearance-panel`    | Open the global Appearance popover (theme / accent / glass / density / nav layout) from the TopNav                                              |
| `toggle-mobile-navigation` | Open or close the primary route menu at tablet and phone widths (960px and below). The route buttons inside reuse their normal `go-to-*` hooks. |
| `reset-appearance`         | Reset Appearance to defaults (popover footer + inline Settings → Appearance card)                                                               |
| `set-accent-{key}`         | Pick an accent palette. `{key}` is `aurora` \| `plasma` \| `terminal` \| `mint`                                                                 |
| `subnav-{id}`              | Switch sub-tabs inside the contextual SubNav. `{id}` matches the section's slug (e.g. `subnav-llm`, `subnav-pipeline`)                          |
| `toggle-theme`             | Flip the app between light and dark theme (rendered in the Settings header)                                                                     |
| `trigger-system-reset`     | Settings → Local data: open the factory-reset confirmation dialog                                                                               |
| `nuke-everything-confirm`  | Settings → Local data: confirm and execute a full local-data wipe                                                                               |
| `keep-everything`          | Cancel the system reset                                                                                                                         |

### Job operations (dashboard)

| Hook                                                                   | Purpose                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run-new-scan`                                                         | Run the complete Global Search pipeline: enabled Tier-1 APIs, enabled JobSpy sources, and watched-company ATS feeds.                                                                                                                                                                         |
| `run-ai-filtering`                                                     | Run the multi-stage LLM filtering pass on scraped jobs                                                                                                                                                                                                                                       |
| `execute-match-scoring`                                                | Run the LLM fit-scoring pass on eligible jobs                                                                                                                                                                                                                                                |
| `toggle-bulk-actions`                                                  | Toggle bulk-selection mode                                                                                                                                                                                                                                                                   |
| `bulk-select-all`                                                      | Select every currently-visible job                                                                                                                                                                                                                                                           |
| `bulk-mark-applied`                                                    | Mark all selected jobs as applied                                                                                                                                                                                                                                                            |
| `bulk-reject`                                                          | Reject all selected jobs                                                                                                                                                                                                                                                                     |
| `export-csv`                                                           | Export the currently-filtered job list as CSV                                                                                                                                                                                                                                                |
| `clear-search`                                                         | Clear the dashboard search box                                                                                                                                                                                                                                                               |
| `filter-job-type`                                                      | Set the job-type filter (full-time, contract, etc.)                                                                                                                                                                                                                                          |
| `filter-platform`                                                      | Set the platform filter (indeed, glassdoor, etc.)                                                                                                                                                                                                                                            |
| `trigger-db-cleanup`                                                   | Open the database wipe confirmation dialog                                                                                                                                                                                                                                                   |
| `nuke-database`                                                        | Confirm and execute the full database wipe                                                                                                                                                                                                                                                   |
| `keep-data`                                                            | Cancel the database wipe                                                                                                                                                                                                                                                                     |
| `toggle-ai-debug-console`                                              | Expand/collapse the AI Debug Console section on the dashboard (the list of jobs the AI filter rejected with reasons). Collapsed by default since 2026-05-17 (D11.16c).                                                                                                                       |
| `apply-{platform}`                                                     | Open the job's application page on a specific board. `{platform}` is the lowercase platform slug (`indeed`, `linkedin`, `glassdoor`, `ziprecruiter`, `google`). Each apply link also carries `data-platform="{platform}"` for filtering. The button itself wears the platform's brand color. |
| `toggle-apply-platforms`                                               | Multi-platform apply: opens / closes the popover that lists every platform this job appears on. Each row inside uses `apply-{platform}`.                                                                                                                                                     |
| `toggle-application-queue`                                             | Show all eligible jobs or only jobs saved to the application queue.                                                                                                                                                                                                                          |
| `bulk-add-to-application-queue`                                        | Add every selected job to the guided-application queue.                                                                                                                                                                                                                                      |
| `start-guided-application-{id}`                                        | Open the browser-readable application packet for one tracked job and queue it if needed.                                                                                                                                                                                                     |
| `add-to-application-queue-{id}` / `remove-from-application-queue-{id}` | Toggle one listing's queue state.                                                                                                                                                                                                                                                            |
| `mark-applied-{id}`                                                    | Record that the user submitted an application without opening the guided packet.                                                                                                                                                                                                             |
| `copy-application-agent-instructions`                                  | Copy the final-submit-safe browser-agent prompt from an open packet.                                                                                                                                                                                                                         |
| `open-guided-application-{id}`                                         | Open the employer's application page from the guided packet.                                                                                                                                                                                                                                 |
| `confirm-application-submitted-{id}`                                   | User confirmation after the employer form was submitted; moves the job into Applied.                                                                                                                                                                                                         |
| `edit-application-details`                                             | Open Preferences from a guided packet to update reusable answers.                                                                                                                                                                                                                            |
| `download-application-resume`                                          | Open the locally stored résumé asset from a guided packet.                                                                                                                                                                                                                                   |

### Active operations (long-running tasks)

| Hook               | Purpose                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `pause-operation`  | Pause an in-flight scan/filter/scoring run (dashboard operation banner) |
| `resume-operation` | Resume a paused operation (dashboard operation banner)                  |
| `cancel-operation` | Abort the current operation (dashboard operation banner)                |

### Applied-jobs tracker

| Hook                          | Purpose                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `filter-status-{status}`      | Filter tracker by `applied` \| `interview` \| `offer` \| `accepted` \| `rejected`        |
| `set-status-{status}-{id}`    | Change a specific job's pipeline status                                                  |
| `toggle-timeline-{id}`        | Expand/collapse a job's timeline panel                                                   |
| `toggle-add-note-{id}`        | Open / close the inline "Add note" form on a job                                         |
| `select-note-type-{id}`       | Pick the note type (general / interview-prep / followup / etc.) inside the add-note form |
| `cancel-add-note-{id}`        | Dismiss the add-note form without saving                                                 |
| `save-note-{id}`              | Save a new timeline note for a job                                                       |
| `delete-note-{id}`            | Delete a single note from a job's timeline. `{id}` is the **note id**, not the job id.   |
| `toggle-details-{id}`         | Expand / collapse the per-job details panel (description, raw job data)                  |
| `view-posting-{id}`           | Open the job's original posting URL in a new tab                                         |
| `remove-applied-job-{id}`     | Remove a job from the tracker                                                            |
| `clear-applied-search`        | Clear the applied-tracker search box                                                     |
| `clear-applied-filters`       | Reset all applied-tracker filters                                                        |
| `export-applied-csv`          | Export the applied-jobs list as CSV                                                      |
| `toggle-reviewed-responses`   | Show or hide already-reviewed Gmail and Google Voice events on the Responses tab.        |
| `confirm-response-link-{id}`  | Link an unmatched response to the application selected by the user.                      |
| `open-response-gmail-{id}`    | Open the source event in Gmail.                                                          |
| `mark-response-reviewed-{id}` | Mark a response as reviewed without changing its matched application.                    |

### Job preferences (`/preferences`)

| Hook                         | Purpose                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `edit-preferences`           | Enter preferences edit mode                                                   |
| `edit-preferences-from-card` | Same, triggered from the dashboard's search-criteria card                     |
| `save-profile`               | Persist the profile (location, education, experience, skills, salary)         |
| `add-title-manually`         | Add a single job title from the input field                                   |
| `clear-job-input`            | Clear the job-title input                                                     |
| `generate-titles`            | Ask the LLM to generate title variations for a category                       |
| `replace-titles`             | Confirm and replace the saved title list with LLM suggestions                 |
| `toggle-title-{id}`          | Enable/disable a specific saved job title                                     |
| `save-application-profile`   | Save reusable answers from Preferences → Application details.                 |
| `upload-application-resume`  | Choose and store the primary PDF/DOC/DOCX résumé used by guided applications. |
| `open-application-resume`    | Open the locally stored primary résumé from Preferences.                      |

### Search presets (`/preferences`, **Presets** sub-tab)

| Hook                          | Purpose                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new-preset`                  | Begin creating a new saved preset                                                                                                                                                                                                                                                                               |
| `create-first-preset`         | Empty-state CTA when no presets exist                                                                                                                                                                                                                                                                           |
| `save-preset`                 | Save the preset draft                                                                                                                                                                                                                                                                                           |
| `cancel-preset-save`          | Cancel without saving                                                                                                                                                                                                                                                                                           |
| `toggle-preset-default`       | Mark a preset as the default for new scans                                                                                                                                                                                                                                                                      |
| `select-preset-remote-pref`   | Pick the remote preference for the preset                                                                                                                                                                                                                                                                       |
| `apply-preset-{id}`           | Open the apply-confirmation dialog for a specific preset. Apply _overwrites_ the user's active profile fields (city/state, search radius, remote preference, salary filter), enabled platforms, and active job titles list with the preset's values. Education, experience, skills, and résumé are not touched. |
| `edit-preset-{id}`            | Enter edit mode for a specific preset                                                                                                                                                                                                                                                                           |
| `delete-preset-{id}`          | Delete a specific preset (no confirmation modal — the action is direct)                                                                                                                                                                                                                                         |
| `toggle-preset-title-{slug}`  | Toggle a job title within the preset draft. `{slug}` is the title text lowercased with whitespace replaced by hyphens (e.g. `senior-frontend-engineer`).                                                                                                                                                        |
| `toggle-preset-platform-{id}` | Toggle a platform on/off within the preset draft. `{id}` is the platform slug (`indeed`, `linkedin`, etc.).                                                                                                                                                                                                     |
| `cancel-apply-preset`         | Dismiss the apply-confirmation dialog without applying.                                                                                                                                                                                                                                                         |
| `confirm-apply-preset`        | Confirm and execute the pending apply. On success the dialog closes, a toast fires, and profile / titles / settings tRPC queries are invalidated so other pages reflect the new state immediately.                                                                                                              |

### Settings (`/settings`)

| Hook                                         | Purpose                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `save-llm-settings`                          | Save LLM provider configuration (active provider, keys, models, rate limit)                                                                                                                                                                                                        |
| `edit-gemini-provider`                       | Switch the editing tab to the Google Gemini configuration form                                                                                                                                                                                                                     |
| `edit-openai-provider`                       | Switch the editing tab to the OpenAI configuration form                                                                                                                                                                                                                            |
| `edit-deepseek-provider`                     | Switch the editing tab to the DeepSeek configuration form                                                                                                                                                                                                                          |
| `clear-gemini-key`                           | Remove the saved Google Gemini API key                                                                                                                                                                                                                                             |
| `clear-openai-key`                           | Remove the saved OpenAI API key                                                                                                                                                                                                                                                    |
| `clear-deepseek-key`                         | Remove the saved DeepSeek API key                                                                                                                                                                                                                                                  |
| `test-gemini-connection`                     | Send a tiny round-trip request to Gemini with the currently-typed key + model and report success/error. If the API-key input is empty and a key is already saved, the saved (unmasked) value is tested instead — sending the masked display value would always 401.                |
| `test-openai-connection`                     | Same, for OpenAI                                                                                                                                                                                                                                                                   |
| `test-deepseek-connection`                   | Same, for DeepSeek                                                                                                                                                                                                                                                                 |
| `test-active-provider`                       | Header-level button on the LLM card. One-click round-trip against whichever provider is currently active, using the saved key + model in `settings.json` (or the env var, if set). Only rendered when a key is configured for the active provider.                                 |
| `save-{source}-credentials`                  | Save the typed credentials for a Tier-1 source to `data/settings.json`. `{source}` is one of `adzuna`, `usajobs`, `jooble`, `themuse`. The mutation accepts a `fields` bag — schema is per-source. Settings → Data Sources (Phase 13 / D-019).                                     |
| `clear-{source}-credentials`                 | Remove the saved credentials for a Tier-1 source. Env vars (if set) still take effect.                                                                                                                                                                                             |
| `test-{source}-credentials`                  | Round-trip a tiny request to a Tier-1 source with the typed-but-not-saved credentials. Falls back to the saved/env credentials if no inputs are filled. The Muse's tester also confirms the no-auth tier works when the optional key is empty.                                     |
| `configure-{source}-credentials`             | "Configure in Settings →" CTA shown on a Tier-1 card on the Platforms page when the platform is toggled on but credentials are missing. Navigates to `/settings`.                                                                                                                  |
| `toggle-platform-{platform}`                 | Toggle whether scans include a given platform. `{platform}` covers both Tier-1 sources (`adzuna`, `usajobs`, `jooble`, `themuse`, `remotive`, `remoteok`) and Tier-2 scrapers (`indeed`, `linkedin`, `glassdoor`, `ziprecruiter`, `google`).                                       |
| `watch-company-{slug}`                       | Toggle a company from the companies catalog into the watched-companies set. `{slug}` matches a catalog entry — adding it triggers per-company ATS fetches on every scan. Lives on the Preferences → Companies sub-tab (Phase 14 / D-020; catalog is maintainer-curated per D-022). |
| `clear-watched-companies`                    | Clear the entire watched-companies set.                                                                                                                                                                                                                                            |
| `clear-company-search`                       | Clear the catalog search input.                                                                                                                                                                                                                                                    |
| `filter-tag-all` / `filter-tag-{tag}`        | Filter the catalog by a tag. `all` clears the tag filter.                                                                                                                                                                                                                          |
| `save-auto-scan`                             | Save the automatic job-scan schedule and whether it includes AI filtering.                                                                                                                                                                                                         |
| `save-notifications`                         | Save desktop-notification preferences                                                                                                                                                                                                                                              |
| `test-notifications`                         | Send a test notification                                                                                                                                                                                                                                                           |
| `open-gmail-api-setup`                       | Open Google Cloud's Gmail API setup page.                                                                                                                                                                                                                                          |
| `save-gmail-client`                          | Save the local Desktop-app OAuth client ID and secret; an existing Gmail connection is cleared.                                                                                                                                                                                    |
| `connect-gmail` / `disconnect-gmail`         | Begin the Google loopback OAuth flow or clear the locally saved connection.                                                                                                                                                                                                        |
| `open-slack-webhook-instructions`            | Open Slack's incoming-webhook setup guide.                                                                                                                                                                                                                                         |
| `save-slack-webhook` / `clear-slack-webhook` | Save or clear the one-way Slack alert destination.                                                                                                                                                                                                                                 |
| `test-slack`                                 | Send a connection-test alert to the saved Slack channel.                                                                                                                                                                                                                           |
| `save-inbox-monitoring`                      | Save Gmail polling and employer-response alert preferences.                                                                                                                                                                                                                        |
| `check-inbox-now`                            | Run one immediate Gmail history poll.                                                                                                                                                                                                                                              |

### Onboarding (`/onboarding`)

| Hook                  | Purpose                                   |
| --------------------- | ----------------------------------------- |
| `onboarding-next`     | Advance to the next step                  |
| `onboarding-back`     | Go to the previous step                   |
| `onboarding-complete` | Finish onboarding and enter the dashboard |

### Work-style Quick Fill (on `/preferences` and `/onboarding` step 2)

Curated job-title starter packs by work style (Phase 15 / D-021). Same dialog component triggered from both Preferences → Job titles and Onboarding step 2.

| Hook                              | Purpose                                                                                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open-work-style-quickfill`       | Open the Quick Fill dialog. Appears on Preferences → Job titles (top of the Manage Job Titles card) and Onboarding step 2 (a "Not sure what to type?" prompt).                                           |
| `select-work-style-category-{id}` | Pick a work-style category. `{id}` is `introvert-friendly`, `extrovert-friendly`, `hands-on`, or `entry-level`. Advances the dialog from the picker to the tuner.                                        |
| `back-to-work-style-picker`       | Return from the tuner step to the category picker.                                                                                                                                                       |
| `cancel-work-style-quickfill`     | Close the dialog without applying.                                                                                                                                                                       |
| `set-work-style-level-{level}`    | Set the Low / Medium / High slider position. `{level}` is `low`, `medium`, or `high`. The slider itself emits this hook; the three discrete labels under it also act as click targets for the same hook. |
| `toggle-suggested-title-{slug}`   | Toggle whether one suggested title will be applied. `{slug}` is the lowercased kebab-case of the title (e.g. `backend-software-engineer`). All titles in the current level start checked.                |
| `apply-work-style-suggestions`    | Apply the currently-checked titles. Append-only merge into `user_job_titles`; existing rows untouched.                                                                                                   |

### Platforms (`/home`)

| Hook                   | Purpose                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `toggle-platform-{id}` | Toggle a single platform on/off globally on the Platforms page. `{id}` is one of `adzuna`, `usajobs`, `jooble`, `themuse`, `remotive`, `remoteok`, `indeed`, `linkedin`, `glassdoor`, `ziprecruiter`, or `google`. |

---

## 3. State broadcasting (`data-agent-status`)

### Async progress (long-running tasks)

| Hook                         | Meaning                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `operation-progress`         | Container for the active operation (scan / filter / scoring). Wait for unmount or for `progress-bar` to read 100. |
| `operation-phase`            | Text describing the current pipeline phase                                                                        |
| `progress-message`           | Real-time log lines from the active operation                                                                     |
| `progress-bar`               | The `role="progressbar"` element. Read `aria-valuenow`.                                                           |
| `progress-bar-indeterminate` | Shown when phase progress is unknown                                                                              |
| `time-estimate`              | Estimated time remaining (text)                                                                                   |

### Dashboard state

| Hook                         | Meaning                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loading-jobs`               | The dashboard is fetching local jobs                                                                                                                                                                                                                                                     |
| `empty-jobs`                 | No eligible jobs to show. The inner copy branches on three sub-states: (a) no jobs scanned at all, (b) jobs scanned but the AI filter hasn't run yet, (c) jobs scanned + filtered but none passed. The status hook is the same in all three so a consumer can wait on a single selector. |
| `dashboard-workflow`         | The WorkflowRail in the left rail — Scan → Filter → Score pipeline + Maintenance row. State of each step is encoded in its sub-elements; the rail itself just marks the region.                                                                                                          |
| `dashboard-status-strip`     | The 5-cell strip at the top of the dashboard main column: Scanned / Eligible / Filtered out / Scored / Awaiting score. Numeric values are the inner `.stat-num` text.                                                                                                                    |
| `llm-key-warning`            | The full-width banner above the dash grid, shown when the active LLM provider has no key configured.                                                                                                                                                                                     |
| `llm-key-status`             | The active-provider key indicator pill rendered in the global TopNav. Two visual states (`badge-ok` = key set, `badge-warn` = no key). On mobile the pill moves into the expanded navigation menu; it remains a click target to `/settings`.                                             |
| `search-criteria`            | Card displaying the current search parameters                                                                                                                                                                                                                                            |
| `bulk-selection-count`       | Number of jobs currently selected in bulk mode                                                                                                                                                                                                                                           |
| `ai-debug-console`           | Expanded AI Debug Console body (list of filtered-out jobs with reasons). Only present when the section is expanded via `toggle-ai-debug-console`.                                                                                                                                        |
| `ai-debug-console-collapsed` | One-line hint shown when the AI Debug Console is collapsed. Mutually exclusive with `ai-debug-console`.                                                                                                                                                                                  |

### Applied-jobs tracker

| Hook                       | Meaning                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `applied-jobs-list`        | The list container                                                                                                                               |
| `applied-jobs-count`       | Total count of jobs in the tracker                                                                                                               |
| `filtered-applied-count`   | Count after the current filters                                                                                                                  |
| `empty-applied-jobs`       | Tracker has no jobs yet                                                                                                                          |
| `no-matching-applied-jobs` | Tracker has jobs but none match current filters                                                                                                  |
| `job-description-{id}`     | Expanded job description body inside a tracker card (only present when `toggle-details-{id}` is open).                                           |
| `timeline-list-{id}`       | A job's timeline-of-notes container (only present when the timeline panel is open via `toggle-timeline-{id}` and the job has at least one note). |
| `empty-timeline-{id}`      | Placeholder shown inside a job's timeline panel when the job has no notes yet. Mutually exclusive with `timeline-list-{id}`.                     |
| `employer-responses`       | Container for the Applied → Responses inbox.                                                                                                     |
| `response-{id}`            | One stored employer-email or Google Voice event.                                                                                                 |
| `matched-application`      | Human-readable job match shown within a response.                                                                                                |

### Presets

| Hook                        | Meaning                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `loading-presets`           | Presets list is loading                                                                                                                        |
| `preset-list`               | Container for the saved presets                                                                                                                |
| `empty-presets`             | No presets saved yet                                                                                                                           |
| `apply-preset-confirm-{id}` | Body of the apply-confirmation dialog while it's open. Lists exactly what the apply will overwrite. Only one of these is in the DOM at a time. |

### Analytics empty-state cards (`/analytics`)

Each of the six analytics cards renders an empty-state region when its data source is empty. Cards with data do not render these hooks.

| Hook                  | Meaning                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `empty-pipeline`      | Application Pipeline card — no applications tracked yet                  |
| `empty-top-companies` | Top Companies card — no eligible jobs to rank                            |
| `empty-job-types`     | Job Types card — no eligible jobs to break down                          |
| `empty-recent-scans`  | Recent Scans card — no scans have run yet                                |
| `empty-match-scores`  | Match Score Distribution — eligible jobs exist but none have been scored |
| `empty-top-matches`   | Top Matches card — no scored jobs to rank                                |

### Onboarding

| Hook                          | Meaning                 |
| ----------------------------- | ----------------------- |
| `onboarding-card`             | The current step's card |
| `onboarding-step-title`       | Step title text         |
| `onboarding-step-description` | Step description text   |
| `onboarding-step-icon`        | Step icon               |

### Preferences sub-sections

| Hook                            | Meaning                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `location-work-preferences`     | Location + remote-preference section                                                          |
| `skills-experience-preferences` | Skills + years-experience section                                                             |
| `salary-preferences`            | Min-salary + filter-toggle section                                                            |
| `parsed-skills-list`            | Live-rendered preview of parsed skills                                                        |
| `resume-text-section`           | Optional résumé text used as context when preparing a guided application packet.              |
| `job-titles-management`         | The saved-titles management panel                                                             |
| `profile-saved`                 | Transient indicator (visible ~4s) confirming `save-profile` succeeded                         |
| `application-profile`           | Preferences → Application details form and saved state.                                       |
| `application-resume`            | Primary résumé upload card.                                                                   |
| `resume-file-ready`             | Confirms a local résumé asset is available to guided packets.                                 |
| `application-assistant-packet`  | Open guided-application dialog containing the job, saved answers, and final-submit boundary.  |
| `saved-application-answers`     | Human-readable applicant answers inside the packet. Individual values use `data-agent-value`. |

### Settings

| Hook                                                                | Meaning                                                                                                                                        |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `llm-settings-card`                                                 | The LLM provider card                                                                                                                          |
| `llm-key-status`                                                    | Active provider's key state ("Active key configured" \| "No key set")                                                                          |
| `active-gemini-key` \| `active-openai-key` \| `active-deepseek-key` | Per-provider info row, present only when that provider has a saved key. Includes masked key + source ("from env var" \| "from settings file"). |
| `notifications-settings-card`                                       | Notifications card                                                                                                                             |
| `autoscan-settings-card`                                            | Auto-scan card                                                                                                                                 |
| `autoscan-schedule`                                                 | Last-run + next-scheduled-run display                                                                                                          |
| `gmail-connection`                                                  | Gmail OAuth client/connection state.                                                                                                           |
| `slack-connection`                                                  | Slack incoming-webhook state.                                                                                                                  |
| `inbox-monitoring-controls`                                         | Polling, Slack-alert, last-checked, and manual-check controls.                                                                                 |

### Other

| Hook                      | Meaning                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `loading-user`            | Auth/user query in flight                                                                                      |
| `current-theme`           | Theme-toggle button's data-agent-status (read its `aria-label` or surrounding icon to determine current theme) |
| `keyboard-shortcuts-help` | Modal dialog body listing every keyboard shortcut. Toggle with `?`.                                            |
| `debug-user-profile`      | Configuration debug viewer — current profile JSON                                                              |
| `debug-search-criteria`   | Debug viewer — derived search criteria                                                                         |
| `debug-ai-filter-rules`   | Debug viewer — derived AI filter rules                                                                         |

### Source and catalog state

| Hook                                    | Meaning                                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scraper-health-card`                   | Container on the **Platforms page** (`/home`) with per-platform scraper telemetry. Moved from Settings in D11.12 (2026-05-17) so per-platform on/off and per-platform success rates live next to each other. |
| `scraper-row-{platform}`                | Single row inside the source-health card. `{platform}` can be any of the eleven Tier-1/Tier-2 platform slugs listed under `toggle-platform-{id}`.                                                            |
| `scraper-error-{platform}`              | Last-error text shown when a platform is degraded or blocked                                                                                                                                                 |
| `platform-broken-{platform}`            | Red "BROKEN" badge in the Platforms-page card header for known-unfixable scrapers                                                                                                                            |
| `platform-broken-reason-{platform}`     | Inline explanation block inside a broken platform's card                                                                                                                                                     |
| `platform-needs-credentials-{platform}` | Amber callout on a Tier-1 platform card when the platform is toggled on but credentials are missing. Includes a "Configure in Settings" CTA (`configure-{platform}-credentials`).                            |
| `platform-credentials-ok-{platform}`    | Green callout on a configured Tier-1 platform card; notes whether credentials came from env or settings file.                                                                                                |
| `data-source-{id}`                      | Container card on Settings → Data Sources for one Tier-1 source (e.g. `data-source-adzuna`).                                                                                                                 |
| `data-source-{id}-status`               | "Configured" / "Not configured" badge on the Data Sources card.                                                                                                                                              |
| `watched-companies-panel`               | Container for the Preferences → Companies sub-tab (Phase 14 / D-020; catalog is maintainer-curated per D-022).                                                                                               |
| `watched-companies-count`               | "X watched / Y in catalog" live counter at the top of the Companies panel.                                                                                                                                   |
| `company-tag-filter`                    | Tag-filter chip row above the catalog list.                                                                                                                                                                  |
| `company-catalog-list`                  | The `<ul>` of catalog entries. Each row is `company-{slug}`.                                                                                                                                                 |
| `company-{slug}`                        | A single row in the catalog list (one company).                                                                                                                                                              |
| `no-matching-companies`                 | Rendered when the search/tag filter narrows the catalog to zero.                                                                                                                                             |
| `work-style-quickfill-dialog`           | The Quick Fill dialog container (Preferences trigger only).                                                                                                                                                  |
| `work-style-quickfill-picker`           | The "pick a category" step of the Quick Fill dialog — visible when no category is selected yet.                                                                                                              |
| `work-style-quickfill-tuner`            | The slider + title-list step of the Quick Fill dialog — visible after a category is picked.                                                                                                                  |
| `work-style-level-description-{level}`  | The friendly description text under the slider. `{level}` is `low`/`medium`/`high`. `aria-live="polite"` so screen readers and agents pick up the change as the slider moves.                                |
| `work-style-suggested-titles`           | The container holding the checkable suggested titles list inside the tuner.                                                                                                                                  |

---

## 4. Data input hooks (`data-agent-input`)

### User profile

| Hook                         | Form element                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `user-state`                 | US state (Select)                                                              |
| `user-city`                  | City (Input)                                                                   |
| `user-search-radius`         | Search radius in miles (Input number)                                          |
| `user-relocate-willingness`  | Willing to relocate (Switch)                                                   |
| `user-remote-preference`     | Remote preference (Select)                                                     |
| `user-education-level`       | Highest degree (Select)                                                        |
| `user-experience-years`      | Total years of experience (Select)                                             |
| `user-skills-raw`            | Free-form skills description (Textarea)                                        |
| `user-resume-text`           | Full résumé text (Textarea) — optional context for guided application packets. |
| `user-min-salary`            | Minimum acceptable salary (Input number)                                       |
| `user-salary-filter-enabled` | Toggle salary filter (Switch)                                                  |
| `user-job-type`              | Job title / category to add or generate variations for (Input)                 |

### Guided application and response monitoring

| Hook                                                                 | Form element                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| `application-full-name`                                              | Reusable legal/preferred name answer (Input).         |
| `application-email`                                                  | Reusable application email (Input).                   |
| `application-phone`                                                  | Reusable application phone number (Input).            |
| `application-start-date`                                             | Earliest start date (date Input).                     |
| `application-address` / `application-address-line-2`                 | Street address fields.                                |
| `application-city` / `application-state` / `application-postal-code` | Application address locality fields.                  |
| `application-work-authorized`                                        | Yes / No / Leave unanswered selector.                 |
| `application-sponsorship`                                            | Yes / No / Leave unanswered selector.                 |
| `application-availability`                                           | Free-form work availability (Textarea).               |
| `application-desired-pay`                                            | Desired-pay answer (Input).                           |
| `application-transportation`                                         | Transportation answer (Input).                        |
| `gmail-client-id` / `gmail-client-secret`                            | Google Desktop-app OAuth credentials.                 |
| `slack-webhook`                                                      | Slack incoming-webhook URL (password Input).          |
| `inbox-monitoring-enabled`                                           | Gmail polling toggle.                                 |
| `employer-response-alerts`                                           | Slack alert toggle for employer responses.            |
| `link-response-{id}`                                                 | Application selector shown for an unmatched response. |

### Appearance popover (global TopNav)

| Hook                | Form element                                                                                                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appearance-glass`  | Glass-intensity slider (0–100 range input).                                                                                                                                                                                                                                                     |
| `appearance-accent` | Accent picker — a draggable range slider with 4 stops (one per accent palette). Drag the thumb to scrub through accents with live preview; the values are integer indexes into the accent list. Each named label below the track also takes a click via its own `set-accent-{key}` action hook. |

### LLM provider configuration

The Settings page exposes one set of fields per provider (`gemini`, `openai`, `deepseek`).

| Hook                     | Form element                           |
| ------------------------ | -------------------------------------- |
| `gemini-api-key`         | Google Gemini API key (password Input) |
| `gemini-model-name`      | Gemini model slug (Input)              |
| `openai-api-key`         | OpenAI API key (password Input)        |
| `openai-model-name`      | OpenAI model slug (Input)              |
| `deepseek-api-key`       | DeepSeek API key (password Input)      |
| `deepseek-model-name`    | DeepSeek model slug (Input)            |
| `llm-rate-limit-enabled` | Enable rate limiting (Checkbox)        |
| `llm-rate-limit-rps`     | Requests per second (Input number)     |

### Companies catalog (Preferences → Companies)

Each catalog entry's checkbox is its own input hook. See `DECISIONS.md` D-020 (mechanics) and D-022 (catalog is maintainer-curated, not community-PR-contributable).

| Hook                   | Form element                                                                 |
| ---------------------- | ---------------------------------------------------------------------------- |
| `company-search`       | Search input filtering the catalog by name / tag / ATS.                      |
| `watch-company-{slug}` | Checkbox toggling whether a catalog company is in the watched-companies set. |

### Tier-1 data sources (Settings → Data Sources)

Per-source credential inputs. Hooks are parameterised as `{source}-{field}`, lowercased. Sources with no credentials (Remotive, RemoteOK) have no inputs. See `DECISIONS.md` D-019 for the tier model.

| Hook             | Form element                                                                   |
| ---------------- | ------------------------------------------------------------------------------ |
| `adzuna-appid`   | Adzuna `app_id` (Input — text)                                                 |
| `adzuna-appkey`  | Adzuna `app_key` (Input — password)                                            |
| `usajobs-email`  | USAJobs registered email — sent as User-Agent header (Input — email)           |
| `usajobs-apikey` | USAJobs API key (Input — password)                                             |
| `jooble-apikey`  | Jooble partner API key (Input — password)                                      |
| `themuse-apikey` | Optional The Muse API key — raises rate limit; not required (Input — password) |

The **active provider** dropdown is a standard `<Select>` component without a `data-agent-input` hook (Radix Select wraps state in non-input elements). To switch providers programmatically, find the SelectTrigger inside `[data-agent-status="llm-settings-card"]` and dispatch a click + select-by-value flow.

---

## 5. Design intent (why the hooks exist)

These notes are aimed at human contributors. They capture the "why" behind the conventions so you can extend the surface correctly.

1. **Hooks are the API.** Treat `data-agent-action`, `data-agent-status`, and `data-agent-input` like a public-ish API for the DOM. Don't rename them casually — anything (an agent, a test, an automation script) that targets them by selector will silently break.
2. **Live regions over timers.** Status hooks paired with `aria-live="polite"` let any consumer (a screen reader, a Playwright test, an LLM-driven browser) react to state changes without polling. Keep the pairing intact when you add or move a hook.
3. **Two-step saves on Preferences.** The Preferences page saves the main profile and the job-titles list separately. This is intentional — it lets users edit titles without re-confirming the whole profile. Don't collapse them into one form without a strong reason.
4. **Honesty in empty + failure states.** Empty states (`empty-jobs`, `empty-applied-jobs`, `empty-presets`) and failure paths from `run-new-scan` (which returns `success: false` and `failedSearchCount` when scraping fails) need to be reachable and honest. Avoid silent fallbacks that look like success.
5. **Form-control conventions.** `data-agent-input="user-*"` on a Radix `<SelectTrigger>` is a button — programmatic consumers `.click()` it and then `.click()` a `[role="option"]`. Plain `<Input>`/`<Textarea>` accept direct value writes. `user-min-salary` is conditional on `user-salary-filter-enabled` being true.
6. **Confirm before destructive actions.** `nuke-database`, `nuke-everything-confirm`, `remove-applied-job-{id}` are irreversible and intentionally require an explicit second click. Don't bypass the dialog.
7. **No "AI-only" routes.** Every page in Job Matrix is built for human use first. The hooks ride on top of normal UI — they don't replace it. If you find yourself wanting to add a route only an agent would use, the design has gone wrong.

---

## 6. Adding new hooks (checklist)

When you add a new interactive UI element:

1. Pick a name following the existing convention — `[verb]-[noun]` for actions, `[context]` for status/input. Lowercase, hyphen-separated.
2. For parameterized hooks, write the placeholder as `{param}` in this file and let the rendered DOM substitute the actual value.
3. Add the element with the appropriate `data-agent-*` attribute.
4. Add a row to the table above in this same commit. Drift between code and this reference is a real bug — anything that targets the missing hook will break silently.
5. If you remove or rename a hook, treat it like a breaking change: update the call sites, update this file, and call it out in `CHANGELOG.md`.
