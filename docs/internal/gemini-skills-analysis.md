# Gemini-in-Chrome skills — analysis & how we'll use them

The operator extracted eight first-party "skill" prompts from the Gemini Chrome
extension and handed them over as reference for Job Matrix's briefing system
(2026-06-13). This document preserves our original analysis of those prompts.
The verbatim third-party files are deliberately excluded from Git; the reusable
ideas are captured here in our own words so a fresh clone remains sufficient for
future prompt work without redistributing Google's source text.

## Why they're relevant

Two reasons this is a good find:

1. **They map almost one-to-one onto our 13-type briefing catalog.** Several are direct
   analogues of briefings we already generate via NotebookLM (flashcards, quiz,
   interview prep, weekly review, fit check). They're a free second opinion on prompt
   design for the exact same jobs.
2. **They're browser-agent skills** — the same shape of thing Job Matrix is *built to be
   driven by* (Agentic Accessibility, `VISION.md`). Studying how Gemini structures a
   skill is studying our own target consumer.

## The shared scaffold (worth adopting as our prompt house-style)

Every one of the eight follows the same skeleton, and it's a clean one:

1. **`Objective:`** — a single declarative line naming the job.
2. **Numbered reasoning steps** — identify → analyze → produce, each with sub-bullets.
3. **`Handling exceptions`** — degrade gracefully, acknowledge limits, and a private
   self-rating ("rate your response 1–10; if not a 10, improve it or admit the gap;
   don't show the score to the user"). A lightweight self-critique loop baked into the
   prompt.
4. **`Final response`** — an explicit output template (tables / headers), plus a house
   style: **sentence case**, **simple sentences, common words**.
5. **`Follow-up questions`** — end by offering one (max two) concrete next action,
   phrased as a question so "yes please" launches the next round.

That last pattern — *always end by offering the next action as a question* — is the most
broadly useful idea here and is currently inconsistent across our prompt files.

## Mapping to our briefing catalog

| Gemini skill | Maps to (our briefing / system) | Fit |
| --- | --- | --- |
| **Check job fit** | Fit-scoring pass (`server/ai-job-filter-csv.ts`) + a potential per-job text briefing | Strong — cleaner structure than ours |
| **Learn with flashcards** | Interview Flashcards (type 12) | Direct 1:1 |
| **Make a quiz** | Interview Quiz (type 13) | Direct 1:1 |
| **Prep for meeting** | Interview Prep Audio (type 3) | Strong — "meeting" → "interview" |
| **Weekly work review** | Weekly Market Pulse (type 2) / Monthly Retrospective (type 10) | Strong |
| **Prep for today** | Daily Coach Briefing (type 1) | Moderate — theirs is calendar-centric; structure transfers |
| **Study guide** | Interview prep / a possible "role study guide" briefing | Moderate |
| **Hype it up!** | The personal-coach *tone* across Daily Coach + Interview Prep | Tone reference, not a 1:1 briefing |

## What to mine from each (concrete)

- **Check job fit** — the cleanest of the set. Adopt: 0–10 score with required-weighted-
  over-preferred; gaps categorized as **skill / experience / credential**; and crucially
  *"how to address each gap in an interview."* Our fit score gives a number + breakdown;
  it does **not** turn gaps into interview talking points. That's a real upgrade, and it
  also strengthens Interview Prep.
- **Hype it up!** — the explicit guardrail **"genuine, not toxic positivity — real talk
  that makes them feel capable"** is exactly the coach voice we want for the Daily Coach
  briefing. Lift that phrasing into the coach-tone instruction.
- **Learn with flashcards / Make a quiz** — compare against our existing type-12/13 prompts.
  Theirs cap counts (≤15 cards, ≤5 questions), enforce one-concept-per-card and a
  recall/comprehension/application mix, and end "Ready for Anki/Quizlet." Cheap wins if
  ours don't already.
- **Prep for meeting** — the "**questions to ask** that show you're prepared / move things
  forward / are forward-looking" trichotomy is a great structure for interview prep
  (candidate questions for the interviewer).
- **Weekly work review** — accomplishments / still-to-do / prioritized-next-week + a
  rhythm observation ("was the week focused or scattered?") maps cleanly to a weekly
  job-search review (applications sent, responses, follow-ups due, what to prioritize).
- **Study guide** — summary / key concepts / vocabulary / how-concepts-connect / memory
  aids / likely-test-topics. A solid skeleton if we ever add a per-role "study guide."

## Recommended use (not urgent — a Phase-9 companion)

These pair naturally with **Phase 9 (Briefings live validation)**, which is where prompt
iteration happens anyway. When iterating the 13 prompt files:

1. Use the matching summary and mapping in this document as the design reference.
2. Adopt the **scaffold** (objective → steps → exceptions+self-rating → output template →
   follow-up-as-question) where ours is looser.
3. Graft the **specific upgrades** above (gaps-as-interview-talking-points, coach-tone
   guardrail, count caps) into our own wording.

No verbatim copying into our shipped prompts — those stay our own content. This
document is the repository's durable reference; the work itself is future
prompt-iteration, owner-driven.
