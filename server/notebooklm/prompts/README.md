# Job Matrix NotebookLM prompts

Hand-curated prompt files that drive each Studio output. These prompts shape each briefing — the wrapper code is plumbing; the prompts are the voice.

## File format

Each `.md` file in this directory has two parts: YAML front-matter (Studio config) and a body (the actual instructions sent to NotebookLM).

```markdown
---
output_type: audio
target: NotebookLM Studio — Audio Overview (Daily Personal Coach)
last_edited: 2026-05-16
description: Two-AI-host daily coaching audio for the user's job search.

# Studio config forwarded to client.generate_audio_overview
studio:
  audio_format: DEEP_DIVE     # DEEP_DIVE | BRIEF | CRITIQUE | DEBATE
  audio_length: DEFAULT       # SHORT | DEFAULT | LONG
  language: en
---

## Instructions (sent to Studio)

[The actual prompt body the LLM receives. Anything above this heading
is treated as human-facing notes and stripped before sending.]

You are two warm, encouraging career coaches delivering a daily personal
briefing on the user's job search. ...
```

`BriefingsClient.load_prompt_with_meta(filename)` parses the front-matter and returns the body (with the "## Instructions" heading and everything above it stripped — so the leading prose is for human readers only).

## Conventions

- **One file per output type per use case.** `daily_audio_coach.md`, `weekly_audio_market.md`, `daily_infographic.md`, etc.
- **Front-matter `studio:` block** picks the Studio enum values. See `../STUDIO_REFERENCE.md` for the full menu of formats/styles/lengths.
- **Iterate the body, not the wrapper.** Adjusting tone, length, structure, or focus is a prompt-file edit. Adjusting Studio format/style is a front-matter edit. The Python wrapper rarely needs to change.
- **Keep human notes outside the `## Instructions` heading.** The wrapper's prompt loader strips everything before that heading. Use the space for context, examples, change-log notes — anything the LLM shouldn't see.

## What lives here (planned)

- `daily_audio_coach.md` — DEEP_DIVE / DEFAULT length, personal-coach tone
- `weekly_audio_market.md` — BRIEF or DEEP_DIVE, market-summary focus
- `daily_infographic.md` — PORTRAIT, BENTO_GRID style, one-pager stats
- (more as we figure out which formats earn their keep)

None of these are written yet — they'll be authored by hand and tuned against live runs.
