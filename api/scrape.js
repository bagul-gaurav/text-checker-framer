/**
 * Serverless function: given ?url=..., fetches the fully-rendered page text
 * via ScrapingBee (a hosted headless-browser API). No local Chromium, so none
 * of the shared-library / Node-version problems that plague self-hosted browsers.
 *
 * Requires an environment variable SCRAPINGBEE_API_KEY (set in the Vercel
 * dashboard -> Settings -> Environment Variables). Free tier at scrapingbee.com.
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

  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error:
        "Missing SCRAPINGBEE_API_KEY. Add it in Vercel -> Settings -> Environment Variables, then redeploy.",
    });
    return;
  }

  try {
    // render_js=true runs a real browser so Framer's client-rendered content
    // is present. extract_rules pulls just the visible text of <body>.
    const params = new URLSearchParams({
      api_key: apiKey,
      url,
      render_js: "true",
      // Wait for network to settle so late-loading content is captured.
      wait_browser: "networkidle2",
      // Return only the body's text content, not raw HTML.
      extract_rules: JSON.stringify({ text: { selector: "body", output: "text" } }),
    });

    const beeResp = await fetch(`https://app.scrapingbee.com/api/v1/?${params.toString()}`);

    if (!beeResp.ok) {
      const detail = await beeResp.text().catch(() => "");
      throw new Error(
        `Scraping service returned ${beeResp.status}. ${detail.slice(0, 200)}`
      );
    }

    const data = await beeResp.json();
    // With extract_rules, ScrapingBee returns JSON like { "text": "..." }
    const text = typeof data === "string" ? data : data.text || "";

    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: `Failed to load page: ${err.message}` });
  }
}
