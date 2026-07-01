import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

/**
 * Serverless function: given ?url=..., loads the page in headless Chromium
 * and returns the visible rendered text.
 *
 * Runs on Node 20 (pinned in vercel.json + package.json engines), which
 * @sparticuz/chromium v131 requires in order to correctly unpack and resolve
 * Chromium's shared libraries (libnss3.so etc.). A mismatched runtime is the
 * usual cause of "error while loading shared libraries".
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
    // Resolve the bundled Chromium binary. If this doesn't return a real path,
    // fail loudly and clearly instead of letting the launch throw the cryptic
    // shared-library error.
    const executablePath = await chromium.executablePath();
    if (!executablePath) {
      throw new Error(
        "Chromium binary did not resolve. This usually means the function's Node runtime doesn't match @sparticuz/chromium (needs Node 20). Confirm the deployment is on nodejs20.x."
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
    res.status(500).json({ error: `Failed to load page: ${err.message}` });
  } finally {
    if (browser) await browser.close();
  }
}
