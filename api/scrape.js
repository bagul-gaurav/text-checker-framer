import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

/**
 * Serverless function: given ?url=..., loads the page in headless Chromium
 * and returns the visible rendered text.
 *
 * IMPORTANT RUNTIME NOTE:
 * @sparticuz/chromium must run on the Node version its build targets (Node 20
 * for this pairing). Vercel now DEFAULTS new projects to Node 24, which does
 * NOT ship compatible libraries and produces:
 *   "libnss3.so: cannot open shared object file"
 * Fix: Vercel dashboard -> Settings -> General -> Node.js Version -> 20.x -> Save
 * -> then redeploy. The dashboard setting overrides package.json/vercel.json.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: "Provide a valid ?url= starting with http(s)://" });
    return;
  }

  let browser;
  try {
    const executablePath = await chromium.executablePath();
    if (!executablePath) {
      throw new Error(
        "Chromium binary did not resolve. Set the Vercel Node.js Version to 20.x (Settings -> General) and redeploy."
      );
    }

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 900 },
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });

    const rawText = await page.evaluate(() => {
      function isVisible(el) {
        const style = window.getComputedStyle(el);
        return (
          style &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          el.offsetParent !== null
        );
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      const chunks = [];
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent.trim();
        if (text && node.parentElement && isVisible(node.parentElement)) {
          chunks.push(text);
        }
      }
      return chunks.join("\n");
    });

    res.status(200).json({ text: rawText });
  } catch (err) {
    // Surface the shared-library error as an actionable message.
    const hint = /libnss3|shared librar|loading shared/i.test(err.message)
      ? " — This is the Node runtime mismatch: set Vercel Node.js Version to 20.x in Settings -> General, then redeploy."
      : "";
    res.status(500).json({ error: `Failed to load page: ${err.message}${hint}` });
  } finally {
    if (browser) await browser.close();
  }
}
