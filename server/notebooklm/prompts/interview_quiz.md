---
output_type: text
target: NotebookLM chat (structured markdown)
last_edited: 2026-05-16
description: A 10-question multi-choice quiz testing knowledge a candidate for this specific role would be expected to have. Self-graded — answers provided after the questions.

# (no studio block — chat/text output)
---

# Interview Quiz — design notes

A self-study quiz the listener can run through before an interview. Tests knowledge or judgment that's *actually likely to come up*, not generic CS-trivia or generic-leadership-trivia.

## Instructions (sent to Studio)

Produce a **markdown document** with **10 multiple-choice questions** drawn from the role described in the source. The listener works through the quiz cold, then scrolls past the spoiler line to see the answers and brief explanations.

### Question selection — anchor to the role

The 10 questions must be genuinely relevant to *this specific role*. Examples of how to choose:

- For a **frontend engineer role at a fintech**: questions on React rendering performance, state management trade-offs, accessibility regulations relevant to finance, security basics like CSRF, plus one or two role-shaped judgment questions ("PM wants to ship X before launch; the design team objects; what do you do?").
- For a **staff backend role at a startup**: questions on distributed systems trade-offs, scaling patterns the JD implies, on-call practices, plus 2–3 judgment / leadership questions specific to staff-level scope.
- For a **product manager role**: questions on prioritisation frameworks, metrics definition, stakeholder management, plus judgment scenarios.

If the role is unclear from the source, default to mid-level questions in the listener's stated target area and note the assumption in the intro.

### Format

Open with a 2-sentence framing:

```
> Quiz for: [role title] at [company]. 10 multi-choice questions. Answers are at the bottom — try the questions cold first.
```

Then the questions, numbered 1–10:

```markdown
**1. [Question.]**

- A. [option]
- B. [option]
- C. [option]
- D. [option]
```

Question types should mix:

- **6 knowledge questions** — testable facts or concepts the role expects familiarity with.
- **3 judgment / scenario questions** — "what would you do if…" with multiple defensible answers; the "right" answer is the one that best fits the role's seniority.
- **1 self-reflection question** — no objectively correct answer, but framed to make the listener think (mark as "no scoring" in the answer key).

### Answer key

A horizontal rule, then a section header `## Answer key`, then for each numbered question:

```markdown
**1. [Correct letter].** [1–3 sentences of why this is right, what's wrong with the most tempting distractor.]
```

For the self-reflection question, write 2–3 sentences on what the answer reveals about the listener's leanings and what to consider.

### Closing

After the answer key, a short closing: "How to use this — questions you got wrong are signal, not failure. The hardest distractor on each question is often the most useful study target."

**Tone constraints.**

- Genuinely challenging. Each question has one right answer and at least one *tempting* wrong answer — make distractors plausible.
- Specific to the role. A frontend quiz for a backend role is malpractice.

**Forbidden.**

- Trivia for trivia's sake (browser-history-of-CSS questions).
- Multi-correct-answer questions disguised as single-correct. If a question has more than one defensible answer, mark it as a judgment question.
- Generic leadership questions copied from any other quiz.
- Sycophantic "great question!" framing in the answer explanations. Be direct.
