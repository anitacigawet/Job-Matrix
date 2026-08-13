---
output_type: text
target: NotebookLM chat (structured markdown)
last_edited: 2026-05-16
description: A set of behavioural-interview flashcards tailored to a specific role. Each card has a question prompt, key talking points, and a watch-out.

# (no studio block — chat/text output)
---

# Interview Flashcards — design notes

Per-role behavioural-interview prep, formatted as flashcards the user can study from. Each card is short, focused, designed to be readable on a phone. NotebookLM's native Flashcards Studio output is a separate path; this prompt produces a structured markdown set that works without that wiring.

## Instructions (sent to Studio)

Produce a **markdown document** containing **10 flashcards** sized for behavioural-interview practice. The role and the listener's profile are in the source.

Tune the cards to:

- The seniority of the role (junior, mid, senior, staff+ have very different expected behavioural questions).
- The most prominent themes in the job description (collaboration, leadership, ambiguity, technical depth, etc.).
- The listener's known background — anchor the suggested talking points in things they actually have on their profile.

### Format for each card

```markdown
### Flashcard [N] — [theme]

**Question**
"[The literal interview question, in the style a real interviewer would phrase it.]"

**Why they're asking**
[1–2 sentences on the underlying competency being assessed.]

**Talking points to anchor on**
- [Specific point pulled from the listener's profile, framed as a possible answer arc.]
- [Another.]
- [One more if relevant.]

**Watch-out**
[A specific failure mode for this question — e.g. "Don't drift into a tools brag — they're testing collaboration, not stack knowledge."]
```

### Distribution

Aim for the following mix across the 10 cards:

- 3 cards on **classic behaviourals tuned to the role** (conflict, failure, leadership, ambiguity — pick the most relevant three for this specific role).
- 3 cards on **role-specific themes** (e.g., scaling, on-call, mentoring, product judgment — whatever the JD signals).
- 2 cards on **questions about the listener's own résumé / story** (career transitions, gaps, why-this-company).
- 2 cards on **questions the listener should ask the interviewer**, framed as flashcards from the other direction ("Question 9 — what to ask them.").

### Closing block

After the 10 flashcards, a short 3–5 sentence paragraph: "How to use these — read once cold, then talk through your answer out loud, then look at the watch-out. Don't memorise."

**Tone constraints.**

- Tight, scannable, mobile-readable. No long preambles.
- Anchor every "talking point" in something specific to the listener. Generic "talk about a time you led a team" cards aren't useful.

**Forbidden.**

- Generic interview question lists scraped from career-coach blogs. The whole point is specificity.
- Fabricated talking points the listener can't actually deliver. If the listener's profile is thin, write a thinner card honestly.
- More than 10 cards (or fewer than 10). Consistency matters here.
- Filler intro paragraphs. Get to the flashcards.
