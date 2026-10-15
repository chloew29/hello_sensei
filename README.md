# Study Buddy (hello_sensei)

Learn any course with Hana-sensei, an AI tutor. Installable web app (PWA) that runs free on Cloudflare Pages with the Gemini API free tier.

## What works in v1

- Onboarding: name, course, starting level, goal, minutes per day, optional PDF or photo. Gemini builds 8 to 12 lessons and 10 flashcards.
- Sensei chat: Hana teaches one small idea at a time, gives multiple-choice quizzes, and stamps the lesson when you show you understand it.
- Home: today's lesson, stamp book, shortcuts.
- Flashcards: flip, Again / Good / Easy.
- Add notes: upload more material to an existing course; Gemini adds the missing lessons and new cards.
- Me: streak, stamps, minutes this week, tutor language (English / 繁體中文 / 日本語), backup and restore.

Progress is stored in the browser on each device (localStorage). There is no account or sync yet, so you and your friend each have your own progress. Use Me > Back up my data before switching phones.

## Project layout

```
public/               the app (plain HTML/CSS/JS, no build step)
  index.html, styles.css, app.js, gemini.js, sw.js, manifest.webmanifest
  assets/             Hana videos, kitten art
functions/api/gemini.js   server proxy that holds the Gemini key
wrangler.toml
```

The browser only ever calls `/api/gemini`. The key lives in Cloudflare, never in the page.

## 1. Get a Gemini key (free)

Go to https://aistudio.google.com, sign in, then **Get API key > Create API key**. Copy it.

Free tier note: Google may use free-tier prompts and uploads to improve its products, and people may review them. Don't upload anything private. Your current limits are shown in AI Studio.

## 2. Run it locally

Requires Node 18+.

```bash
cp .dev.vars.example .dev.vars      # then paste your key into .dev.vars
npx wrangler pages dev
```

Open the printed URL (usually http://localhost:8788).

## 3. Deploy (free)

Option A, straight from your laptop:

```bash
npx wrangler login
npx wrangler pages deploy        # first run asks for a project name, e.g. study-buddy
```

Then in the Cloudflare dashboard: **Workers & Pages > study-buddy > Settings > Variables and Secrets**, add

| Name | Value |
|---|---|
| `GEMINI_API_KEY` | your key (type: Secret) |
| `APP_PASSCODE` | any word you and your friend will share |
| `GEMINI_MODEL` | optional, defaults to `gemini-flash-latest` |

and run `npx wrangler pages deploy` once more so they take effect.

Option B, from GitHub: push this folder to a repo, then **Workers & Pages > Create > Pages > Connect to Git**. Build command: none. Output directory: `public`. Add the same variables.

## 4. Put it on your phone

Open your `https://<project>.pages.dev` link.
- iPhone (Safari): Share > Add to Home Screen.
- Android (Chrome): menu > Install app.

The first AI request asks for the passcode. Send your friend the link and the passcode.

## Changing things

- Different model: set `GEMINI_MODEL` (for example a specific Flash version from AI Studio).
- Different AI provider later: only `functions/api/gemini.js` talks to Google. Swap its fetch for another provider and keep returning `{ text }` with JSON inside.
- After editing files in `public/`, bump `VERSION` in `public/sw.js` so installed apps pick up the change.

## Limits to know

- Uploads must be under about 14 MB (Gemini inline limit). Split big PDFs.
- If the free quota runs out, the app says so; try again later.
- Hana's art and videos are AI-generated; check your image and video tool's terms before any commercial use.
