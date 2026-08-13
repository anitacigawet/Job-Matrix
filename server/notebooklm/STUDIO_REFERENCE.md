# NotebookLM Studio — UI Reference

> **Origin:** captured during Z-SPAN's NotebookLM integration on 2026-05-05 and ported into Job Matrix as a starting reference. The customization options described here are intrinsic to NotebookLM, so the doc is largely portable; the "Z-SPAN current default" snippets in each section are *examples* of how one project tuned the knobs — keep them as inspiration when picking Job Matrix's own defaults.

This doc enumerates every customization option exposed in the NotebookLM Studio UI, with the corresponding `notebooklm-py` enum value. Update it as you discover new defaults, suggestion chips, or quirks while iterating Job Matrix's prompts.

---

## Studio panel — full output type list

The Studio panel has **9 output types** in this order:

| Position | Output | Status badge | Z-SPAN scope |
|---|---|---|---|
| 1 | Audio Overview | — | ✅ in scope (`audio_overview`) |
| 2 | Slide Deck | BETA | future / educational variant |
| 3 | Video Overview | — | ✅ in scope (`video_explainer`) |
| 4 | Mind Map | — | future / educational variant |
| 5 | Reports | — | partial — could replace newsletter |
| 6 | Flashcards | — | future / civic literacy |
| 7 | Quiz | — | future / civic literacy |
| 8 | Infographic | BETA | ✅ in scope (`infographic`) |
| 9 | Data Table | — | future / structured-data variant |

Each card has a chevron `>` on the right edge — click that (not the card body) to open the customization panel. Card body click just shows a tooltip.

---

## 1. Customize Audio Overview

### Format (4 options) — maps to `notebooklm.rpc.AudioFormat`
| UI label | Enum | Description (per UI) |
|---|---|---|
| Deep Dive ✓ default | `DEEP_DIVE` (1) | "A lively conversation between two hosts, unpacking and connecting topics in your sources" |
| Brief | `BRIEF` (2) | "A bite-sized overview to help you grasp the core ideas from your sources quickly" |
| Critique | `CRITIQUE` (3) | "An expert review of your sources, offering constructive feedback to help you improve your material" |
| Debate | `DEBATE` (4) | "A thoughtful debate between two hosts, illuminating different perspectives on your sources" |

### Length (3 options) — maps to `AudioLength`
- Short (`SHORT` = 1)
- **Default** ✓ default (`DEFAULT` = 2)
- Long (`LONG` = 3)

### Language
- Single-select dropdown. Default: English. (Many other languages available; full list not captured.)

### Instructions field
- Label: **"What should the hosts focus on in this episode?"**
- Suggested chips (NotebookLM auto-infers from sources — for our Kingman notebook these were generic):
  - Focus on a specific source ("only cover the article about Italy")
  - Focus on a specific topic ("just discuss the novel's main character")
  - Target a specific audience ("explain to someone new to biology")
- Maps to `instructions=` parameter on `client.artifacts.generate_audio()`.

### Z-SPAN current default
```yaml
studio:
  audio_format: DEEP_DIVE
  audio_length: LONG          # (UI default is DEFAULT; we override to LONG for "Commuter Catch-up" exhaustive coverage)
  language: en
```

---

## 2. Customize Video Overview

### Format (2 options) — maps to `VideoFormat`
| UI label | Enum | Description |
|---|---|---|
| Explainer ✓ default | `EXPLAINER` (1) | "A structured, comprehensive overview that connects the dots within your sources" |
| Brief | `BRIEF` (2) | "A bite-sized overview to help you quickly grasp core ideas from your sources" |

> Note: `VideoFormat.CINEMATIC` (3) exists in the wrapper but is NOT shown in the UI for non-Ultra accounts. Requires a Google AI Ultra subscription. Generation time ~30-40 min via Veo 3.

### Language
- Dropdown. Default: English.

### Visual style (10 options) — maps to `VideoStyle` — each has a thumbnail preview
| Position | UI label | Enum | Visual cue |
|---|---|---|---|
| 1 | Auto-select ✓ default | `AUTO_SELECT` (1) | spinning icon |
| 2 | Custom | `CUSTOM` (2) | pencil icon |
| 3 | Classic | `CLASSIC` (3) | clean Z-SPAN-like logomark |
| 4 | Whiteboard | `WHITEBOARD` (4) | sketchy hand-drawn mountain |
| 5 | Kawaii | `KAWAII` (5) | cute pastel mountains with face |
| 6 | Anime | `ANIME` (6) | anime-style mountain |
| 7 | Watercolor | `WATERCOLOR` (7) | soft painted mountains |
| 8 | Retro print | `RETRO_PRINT` (8) | retro magazine-print mountains |
| 9 | Heritage | `HERITAGE` (9) | archival/textured mountains |
| 10 | Paper-craft | `PAPER_CRAFT` (10) | paper craft mountains |

The thumbnails are auto-rendered scenes — a useful preview of each style's tone. Scroll the carousel with the `<` / `>` arrows.

### Instructions field
- Label: **"What should the AI hosts focus on?"**
- Placeholder: "Summarize the key agenda items, public concerns, and council actions from the meeting."
- **NotebookLM auto-suggested chips for our Kingman notebook:**
  - + Council Meeting Summary
  - + Citizen Advocacy Focus
  - + Legislative Process Review
- (NotebookLM inferred the civic context — useful signal that source-grounding is working.)

### Z-SPAN current default
```yaml
studio:
  video_format: EXPLAINER
  video_style: CLASSIC        # (UI default is AUTO_SELECT; we pin CLASSIC for the canonical broadcast)
  language: en
```

---

## 3. Customize Infographic

### Language
- Dropdown. Default: English.

### Orientation (3 options) — maps to `InfographicOrientation`
- Landscape ✓ default in UI (`LANDSCAPE` = 1)
- Portrait (`PORTRAIT` = 2)
- Square (`SQUARE` = 3)

> Z-SPAN overrides to **PORTRAIT** for the brand-spec civic infographic.

### Visual style (11 options) — maps to `InfographicStyle` — each has a thumbnail (rocket-themed previews!)
| Position | UI label | Enum | Visual cue |
|---|---|---|---|
| 1 | Auto-select ✓ default | `AUTO_SELECT` (1) | spinning icon |
| 2 | Sketch Note | `SKETCH_NOTE` (2) | hand-drawn rocket sketch |
| 3 | Kawaii | `KAWAII` (10) | cute pastel rocket with face |
| 4 | Professional | `PROFESSIONAL` (3) | clean blue rocket |
| 5 | Scientific | `SCIENTIFIC` (11) | technical industrial rocket |
| 6 | Anime | `ANIME` (9) | anime-style rocket |
| 7 | Clay | `CLAY` (8) | claymation rocket |
| 8 | Editorial | `EDITORIAL` (5) | illustrated rocket scene |
| 9 | Instructional | `INSTRUCTIONAL` (6) | split-panel diagram |
| 10 | Bento Grid | `BENTO_GRID` (4) | grid-of-tiles layout |
| 11 | Bricks | `BRICKS` (7) | lego-block rocket |

> Note: enum values aren't 1-11 in display order — they're in the order Google added them. The UI display order is curated.

### Level of detail (3 options) — maps to `InfographicDetail`
- Concise (`CONCISE` = 1)
- **Standard** ✓ default in UI (`STANDARD` = 2)
- Detailed (BETA badge) (`DETAILED` = 3)

> Z-SPAN overrides to **DETAILED** because civic meetings have many discrete data points worth surfacing.

### Instructions field
- Label: **"Describe the infographic you want to create"**
- Placeholder: "Guide the style, color, or focus: 'Use a blue color theme and highlight the 3 key stats.'"

### Z-SPAN current default
```yaml
studio:
  orientation: PORTRAIT
  detail_level: DETAILED
  style: PROFESSIONAL          # (UI default is AUTO_SELECT; we pin PROFESSIONAL for the civic-pro broadcast)
  language: en
```

---

## Other output types (not in MVP, captured for future reference)

These weren't deeply explored — placeholders for when we add educational variants or alternative formats:

| Type | Likely use for Z-SPAN | Notes |
|---|---|---|
| **Slide Deck** | Educational walkthroughs of a meeting | BETA. Wrapper supports `generate_slide_deck` + per-slide `revise_slide` |
| **Mind Map** | Visual graph of meeting topics | `generate_mind_map` |
| **Reports** | Structured deep-dive doc per meeting | Could supplement or replace the 150-word newsletter for long-form readers |
| **Flashcards** | Civic-literacy study aid (city council 101) | `generate_flashcards` |
| **Quiz** | Public knowledge check post-meeting | `generate_quiz` with QuizDifficulty + QuizQuantity |
| **Data Table** | Machine-readable extraction (vote counts, $ amounts) | `generate_data_table` — interesting for the future MCP server idea |

---

## How the wrapper exposes generation + download

```python
# Generation (returns GenerationStatus with .task_id)
gen = await client.artifacts.generate_audio(notebook_id, instructions=..., audio_format=AudioFormat.DEEP_DIVE, audio_length=AudioLength.LONG)

# Wait for completion (with exponential-backoff polling)
status = await client.artifacts.wait_for_completion(notebook_id, gen.task_id, timeout=1500)

# Download to local file
path = await client.artifacts.download_audio(notebook_id, output_path="audio_overview.mp4", artifact_id=gen.task_id)
```

Equivalents for `generate_video` / `download_video` (MP4) and `generate_infographic` / `download_infographic` (PNG).

The wrapper's `wait_for_completion` already verifies media URL availability before reporting `COMPLETED` (it downgrades to `PROCESSING` if status is set but the media URLs aren't populated yet — see `_artifacts.py:_is_media_ready`). So when our bridge gets a `COMPLETED` status, the download can proceed immediately.

---

## Generation timing observed (Kingman City Council, ~2hr YouTube source)

| Output | Wall time | Notes |
|---|---|---|
| Newsletter (chat.ask) | ~24-30 sec | Source already ingested |
| Audio Overview (Deep Dive, Long) | first run reported `is_complete` in ~30 sec but UI continued generating for several more minutes | Possible mismatch between wrapper's "completion" signal and actual media URL availability — investigate |
| Infographic (PORTRAIT, DETAILED, PROFESSIONAL) | TBD (currently running) | |
| Video Overview (EXPLAINER, CLASSIC) | TBD | Expect 10-15 min |

We will refine these timing estimates as we run more test broadcasts.

---

## Curiosity captured: NotebookLM auto-generates a default audio overview

When the source was first added, NotebookLM appears to have **auto-created** a "Deep Dive" audio overview ("Kingman's Sales Tax...") without an explicit API call from us. This shows up in the artifact list alongside artifacts our bridge generates.

**Implication:** the `download_audio(artifact_id=None)` path defaults to "first completed audio" — which might pick up the NotebookLM-auto one rather than ours. Always pass `artifact_id=gen.task_id` from `generate_audio` to be explicit. Our bridge already does this. ✓

---

## Updates needed when iterating prompts

When you drop in refined prompt files (newsletter, audio_overview, infographic), the workflow is:
1. Replace the `## Instructions (sent to Studio)` section in the relevant `prompts/<file>.md`
2. Optionally adjust `studio:` front-matter (format/style/length) for variant audiences
3. Reset the work order: `update_work_order_state(<id>, 'pending', error='')` and clear `notebook_outputs` rows for that meeting
4. Re-run the worker on that work order: `python -m notebooklm_bridge.worker --work-order-id N`
5. Inspect outputs (audio file in `media/<id>/`, infographic PNG, video MP4) and the newsletter text
6. Iterate until satisfied
