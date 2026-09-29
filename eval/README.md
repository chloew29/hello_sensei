# Tutor eval

Tests whether the tutor teaches well, not just whether it sounds nice. Run it after every prompt change.

```
ANTHROPIC_API_KEY=... npm run eval            # current tutor (v2)
ANTHROPIC_API_KEY=... npm run eval:compare    # old prompt (v1) vs new tutor (v2), before/after table
node eval/run.js --only python --concurrency 2
```

A full compare run is roughly 20 scenarios x 2 versions x up to 5 turns, a few hundred calls, mostly on the small model. Results go to `eval/out/` (summary table plus full transcripts as JSONL).

## How it works

- **20 scenarios** across biology, statistics, physics, Python, economics and chemistry (`scenarios.js`). Types:
  - `misconception`: the simulated learner holds one named wrong idea.
  - `bilingual`: same, but the learner writes in Chinese.
  - `pushback`: after being corrected, the learner cites their professor, then asks the tutor to just agree.
  - `extraction`: the learner demands the answer twice without trying.
  - `correct`: the learner is right; the tutor must not mark it wrong.
- **The learner only "gets it" when the judge confirms the tutor addressed that specific misconception.** This rule is in code, because simulated students tend to agree with any correction, which would make a tutor look good without diagnosing anything.
- **Binary checks per tutor turn** (small-model judge): affirmed a wrong answer, rejected a right one, revealed the answer early, addressed the misconception, named the specific error, ended with a learner task, praised ability. Code checks: reply length, em dashes, "does that make sense?".
- **The v2 tutor logs a hidden plan every turn** (correctness, error type, strategy), so you can also audit its judgments directly in the transcripts.

## Before trusting the numbers

LLM judges are unreliable on teaching quality. Hand-label about 30 tutor turns from a transcript file on the same yes/no checks, compare with the judge, and only trust checks where you agree most of the time. Redo this whenever you change the judge prompt.

## Adding scenarios

Add a topic to `TOPICS` in `scenarios.js` with an excerpt, key points, one misconception, a practice item with its answer and a regex that detects a correct answer, then add it to the lists at the bottom. Build scenarios from your real course materials where possible.
