# Study Buddy

A private AI tutor for any course. Two (or more) people share one app, each with their own progress.

- Add a course: syllabus, slides, notes, photos of the board. Pick goal, deadline, starting level (including "Not sure").
- Claude builds a unit plan from zero, ordered by prerequisites.
- Diagnostic quiz finds the starting point.
- Tutor chat per unit, grounded in your materials, with one-tap methods: explain simpler, example, analogy, memory trick, quiz me, teach-back, diagram, compare, exam tips, summary sheet.
- Unit quizzes (80% marks a unit done). Missed questions go into spaced review.
- Each week, add new teacher materials. New topics are added to the plan.
- Shared progress board: units done, last score, streak, shaky concepts.
- Installs to the phone home screen (iPhone: Share > Add to Home Screen).

## Deploy (about 15 minutes)

1. Put this folder on GitHub (new private repo, upload the files).
2. Go to vercel.com, sign in with GitHub, **Add New > Project**, import the repo.
3. In the project, open **Storage > Create Database > Upstash for Redis** (free tier) and connect it. This sets the database env vars for you.
4. In **Settings > Environment Variables**, add:
   - `ANTHROPIC_API_KEY`: from console.anthropic.com
   - `APP_PASSCODE`: any passcode you both use to sign in
   - `CLAUDE_MODEL` (optional): defaults to `claude-sonnet-4-6`
5. **Deployments > Redeploy.** Open the URL on both phones, sign in with your names and the passcode, and add it to the home screen.

## Run locally

```
npm install
cp .env.example .env.local   # fill in the key and passcode
npm run dev
```
Without Redis env vars, data is saved to `.data/db.json`. Set `MOCK_AI=1` and leave the API key empty to click through the app without spending tokens.

## Limits

- 4 MB per file (Vercel upload limit). Split big PDFs or export fewer pages.
- Scanned PDFs with no text layer: upload photos of the pages instead; those are transcribed by Claude.
- Cost: roughly a few cents per study session with Sonnet. Set a monthly spend limit in the Anthropic console.
- Dates use UTC, so "due today" flips at 5 pm Pacific.

## How it teaches (v2)

- **Hidden answer key per unit**, generated from your materials, fact-checked by a second pass, and cached. It holds key points, common misconceptions, a worked example and practice answers. It regenerates when you add materials.
- **Tutor rules**: guess first, then explain, then refute the tempting wrong idea; every reply ends with something you must answer; a 5-step hint ladder ("I'm stuck"); "Show answer" only after you've tried; never backs down from a correct correction just because you push back (an independent check on the small model decides).
- **A hidden plan every turn** (was the answer right, which misconception, which strategy) drives the learner state and is logged for evaluation.
- **Quizzes**: type your answer first, rate your confidence, then pick. Questions are double-checked by a second model and dropped if it disagrees.
- **Learned vs mastered**: 80% makes a unit "learned". It becomes "mastered" only if you pass again 2 to 3 days later without help.
- **Review**: every quiz question goes in, timed to your exam date. Confident mistakes come back the same day. An item clears after correct recall on 3 separate days.
- **Mistake notebook (错题本)**: every miss, why it happened, and your own one-line fix.

## Tutor eval

`npm run eval:compare` runs the old and new tutor on 20 scripted learners and prints a before/after table. See `eval/README.md`.

Optional env: `CHECK_MODEL` (default `claude-haiku-4-5`) for grading, re-checks and the eval judge.

## Where things are

- `lib/pedagogy.js`: the tutor's teaching method and system prompt. Edit here to change how it teaches.
- `lib/tutor.js`: turn engine (reveal gate, hint ladder, pushback re-check, hidden plan).
- `lib/kit.js`: answer key generation and verification. `lib/grading.js`: typed-answer grading and quiz checks.
- `lib/materials.js`: file reading (PDF, PowerPoint, Word, images) and retrieval.
- `eval/`: scripted scenarios and the eval runner.
- `app/api/*`: server routes. `app/course/*`: screens.
