# Content Check — Framer QC (web tool)

An on-demand web page: **drop a `.docx`, paste a staging URL, hit Check** — and
see exactly which lines from your document didn't make it onto the page. Works
for standalone and CMS pages alike (once published, both are just URLs).

No mapping files, no schedule, no terminal.

## How it works

- The **document** is parsed *in your browser* (via mammoth) — it's never uploaded anywhere.
- A tiny **serverless function** (`/api/scrape`) asks a **hosted scraping API
  (ScrapingBee)** to load the staging URL in a real browser and return the
  rendered text. Because the browser runs on their infrastructure, there's no
  Chromium binary to install and none of the Node-version / shared-library
  problems that come with self-hosting a headless browser.
- The two are compared line by line, using a fuzzy similarity threshold so
  minor rewording/punctuation differences don't cause false alarms.

The report has three sections:
1. **Missing from the site** — content in your doc that isn't on the page.
2. **Out of order** — content that IS on the page but not in the top-to-bottom
   sequence it has in your document.
3. **Extra on the site** — content on the page that isn't in your document.

### Doc cleaning (automatic)
- **Formatting markers are stripped:** a line like `H2: Our Mission` is checked
  as just `Our Mission`. Handles `H1:`–`H6:` and `Heading 1:`–`Heading 6:`.
- **Metadata fields are skipped entirely:** lines beginning with `Title:`,
  `Description:`, `OG tagline:`, `OG description:`, `Keywords:`, `Author:`,
  `URL:`, `Slug:`, `Tags:`, `Meta title:`, `Meta description:` are ignored, so
  they don't get counted as missing content. Edit the `METADATA_LABELS` list at
  the top of the `<script>` in `public/index.html` to add or remove fields.

## Scoping the check (optional)

By default the whole page is checked. Two optional fields let you narrow it:

- **Include** — only check text inside these containers (e.g. `#MainContent, .article-body`).
- **Exclude** — remove these before checking (e.g. `nav, footer, .cookie-banner`).

Both take comma-separated **CSS selectors**. Note: **you can't select Framer
layers from inside the editor** (Framer has no API for that), but there are two
easy ways to get a selector:

1. **Framer layer name.** A frame you named in Framer (e.g. *MainContent*) often
   appears on the published page as an id/class — try `#MainContent` in Include.
2. **Inspect the live page.** Right-click the container → Inspect → in dev tools,
   right-click the element → Copy → Copy selector.

If an Include selector matches nothing, the tool warns you instead of reporting
everything as missing.

## Setup (one time, ~5 minutes, free — no CLI needed)

### 1. Get a free scraping API key
1. Sign up at **https://www.scrapingbee.com** (free tier includes 1,000 credits — plenty for QC).
2. From your ScrapingBee dashboard, copy your **API key**.

### 2. Deploy to Vercel (drag-and-drop, no terminal)
1. Unzip this download so you have the `framer-qc-tool` folder.
2. Go to **https://vercel.com/new**.
3. Drop the **unzipped folder** into the deploy area (or import it from a GitHub repo).
4. Let it deploy.

### 3. Add your API key
1. In Vercel: your project → **Settings** → **Environment Variables**.
2. Add a variable named exactly **`SCRAPINGBEE_API_KEY`**, paste your key as the value, Save.
3. Go to **Deployments** → open the latest → **⋯** → **Redeploy** so the key takes effect.

That's it. Open your deployment URL and use the tool.

## Using it

1. Open your deployed URL.
2. Drop in the `.docx`.
3. Paste the staging page URL (the published one — publish in Framer first).
4. Hit **Check content**. You'll get a scorecard and, if anything's missing,
   the exact lines plus their closest match on the page.

## Tuning

- **False positives** (flagging content that's actually there, just reworded):
  lower `SIMILARITY_THRESHOLD` in `public/index.html` (e.g. to `0.6`).
- **Missing genuinely-absent content**: raise it (e.g. to `0.8`).

## Troubleshooting

- **"Missing SCRAPINGBEE_API_KEY":** you haven't added the environment variable,
  or didn't redeploy after adding it. Do step 3 above, then redeploy.
- **"Scraping service returned 401":** the API key is wrong or has a typo.
- **"Scraping service returned 429" or credit errors:** you've used up the free
  credits for the month.

## Notes / limits

- Checks the **published** page, not the Framer editor draft.
- Assumes the staging site is publicly reachable (no password).
- Uses ~1 ScrapingBee credit (with JS rendering, a handful) per check — the free
  tier covers a lot of QC runs.
