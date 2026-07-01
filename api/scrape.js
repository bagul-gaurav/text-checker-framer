import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

/**
 * Serverless function: given ?url=..., loads the page in headless Chromium
 * and returns the visible rendered text. Needed because Framer renders
 * content client-side (a plain fetch would miss it) and because browsers
 * block cross-origin scraping from the frontend directly.
 *
 * Uses puppeteer-core + @sparticuz/chromium, the reliable combo for
 * headless Chromium in a Vercel serverless function.
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
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 900 },
      executablePath: await chromium.executablePath(),
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
