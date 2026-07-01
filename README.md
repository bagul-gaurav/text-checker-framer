# Content Check — Framer QC (web tool)

An on-demand web page: **drop a `.docx`, paste a staging URL, hit Check** — and
see exactly which lines from your document didn't make it onto the page. Works
for standalone and CMS pages alike (once published, both are just URLs).

No mapping files, no schedule, no terminal. You open the page and use it.

## How it works

- The **document** is parsed *in your browser* (via mammoth) — it's never uploaded anywhere.
- A tiny **serverless function** (`/api/scrape`) loads the staging URL in a headless
  Chromium (via `puppeteer-core` + `@sparticuz/chromium`) and returns the page's
  rendered text. This step is required because
  (a) Framer renders content client-side, so a plain fetch would miss it, and
  (b) browsers block a web page from scraping another site directly.
- The two are compared line by line, using a fuzzy similarity threshold so
  minor rewording/punctuation differences don't cause false alarms.

## Deploy (one time, ~5 minutes, free)

1. **Install the Vercel CLI** (if you don't have it):
   ```bash
   npm i -g vercel
   ```
2. **From this folder, deploy:**
   ```bash
   vercel
   ```
   Accept the defaults. When it finishes, it gives you a URL like
   `https://framer-qc-tool.vercel.app`. That's your tool — bookmark it.
3. To push updates later: `vercel --prod`.

> Prefer no CLI? You can also drag this folder into a new project on
> [vercel.com](https://vercel.com/new) via a Git repo — Vercel auto-detects the
> `api/` function and `public/` static page.

## Using it

1. Open your deployed URL.
2. Drop in the `.docx`.
3. Paste the staging page URL (the published one — publish in Framer first).
4. Hit **Check content**. In ~20 seconds you'll get a scorecard and, if
   anything's missing, the exact lines plus their closest match on the page.

## Tuning

- **False positives** (flagging content that's actually there, just reworded):
  lower `SIMILARITY_THRESHOLD` in `public/index.html` (e.g. to `0.6`).
- **Missing genuinely-absent content**: raise it (e.g. to `0.8`).

## Troubleshooting

### "libnss3.so: cannot open shared object file" / browser won't launch

This means the serverless Chromium couldn't start, and it's almost always the
**Node runtime version**. `@sparticuz/chromium` needs **Node 20** to correctly
unpack Chromium's shared libraries. This project pins Node 20 in both
`package.json` (`engines`) and `vercel.json` (`runtime`), **but Vercel's
dashboard setting can override those** — so check it directly:

1. Go to your project on **vercel.com** → **Settings** → **General**.
2. Find **Node.js Version**. Set it to **20.x**. Save.
3. Also under **Settings → Functions**, confirm the runtime isn't forced to
   something else.
4. Redeploy: delete `node_modules` and `package-lock.json` locally, run
   `npm install`, then `vercel --prod`.

After redeploying, if it still fails, the function now returns a **clear
message** ("Chromium binary did not resolve…") instead of the cryptic library
error — which confirms the runtime is still wrong and needs the dashboard change
above.

### Function times out on large pages

Raise `maxDuration` in `vercel.json` (Hobby plan allows up to 60s).

## Notes / limits

- Checks the **published** page, not the Framer editor draft.
- Assumes the staging site is publicly reachable (no password). If you later
  password-protect it, the scraper would need credentials added — ask and I can
  extend it.
- Content that only appears after user interaction (clicking a tab, infinite
  scroll) may need a tweak to `api/scrape.js` to trigger that first.
