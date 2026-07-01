/**
 * Preview endpoint: loads the page via ScrapingBee, returns
 *   - a full-page screenshot (base64 PNG)
 *   - the page's pixel dimensions
 *   - a list of meaningful content blocks, each with its bounding box
 *     (relative to the screenshot) and a stable CSS selector
 *
 * The frontend overlays clickable boxes on the screenshot so the user can
 * pick which blocks to INCLUDE in the QC scope.
 *
 * Requires env var SCRAPINGBEE_API_KEY.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: "Provide a valid ?url= starting with http(s)://" });
    return;
  }
  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing SCRAPINGBEE_API_KEY. Add it in Vercel -> Settings -> Environment Variables, then redeploy." });
    return;
  }

  // Snippet that runs in the page: find meaningful content blocks, record a
  // stable selector + bounding box for each, and stash as JSON we can read back.
  const jsSnippet = `
    (function() {
      function cssPath(el) {
        if (el.id) return "#" + CSS.escape(el.id);
        var parts = [];
        while (el && el.nodeType === 1 && el.tagName.toLowerCase() !== "body") {
          var sel = el.tagName.toLowerCase();
          if (el.id) { parts.unshift("#" + CSS.escape(el.id)); break; }
          var parent = el.parentElement;
          if (parent) {
            var sibs = Array.prototype.filter.call(parent.children, function(c){ return c.tagName === el.tagName; });
            if (sibs.length > 1) sel += ":nth-of-type(" + (Array.prototype.indexOf.call(sibs, el) + 1) + ")";
          }
          parts.unshift(sel);
          el = el.parentElement;
        }
        return parts.join(" > ");
      }
      function textLen(el){ return (el.innerText || "").trim().length; }

      // Candidate blocks: sections, main, article, headings, and sizable text containers.
      var candidates = Array.prototype.slice.call(
        document.querySelectorAll("section, main, article, header, footer, nav, h1, h2, h3, [data-framer-name], div")
      );
      var seen = new Set();
      var blocks = [];
      candidates.forEach(function(el) {
        var r = el.getBoundingClientRect();
        var top = r.top + window.scrollY, left = r.left + window.scrollX;
        // Keep blocks that are visible, reasonably sized, and hold real text.
        if (r.width < 80 || r.height < 24) return;
        if (textLen(el) < 15) return;
        var st = window.getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden") return;
        // De-dupe near-identical boxes (a wrapper and its only child).
        var key = Math.round(top) + ":" + Math.round(left) + ":" + Math.round(r.width) + ":" + Math.round(r.height);
        if (seen.has(key)) return;
        seen.add(key);
        blocks.push({
          selector: cssPath(el),
          name: el.getAttribute("data-framer-name") || el.id || el.tagName.toLowerCase(),
          x: Math.round(left), y: Math.round(top),
          w: Math.round(r.width), h: Math.round(r.height),
          chars: textLen(el)
        });
      });
      // Sort largest-area first so big sections sit under smaller ones in the overlay.
      blocks.sort(function(a,b){ return (b.w*b.h) - (a.w*a.h); });
      // Cap to keep the payload sane.
      blocks = blocks.slice(0, 120);

      var holder = document.createElement("div");
      holder.id = "__qc_blocks__";
      holder.style.display = "none";
      holder.textContent = JSON.stringify({
        pageWidth: document.documentElement.scrollWidth,
        pageHeight: document.documentElement.scrollHeight,
        blocks: blocks
      });
      document.body.appendChild(holder);
    })();
  `;

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      url,
      render_js: "true",
      wait_browser: "networkidle2",
      screenshot: "true",
      screenshot_full_page: "true",
      js_scenario: JSON.stringify({ instructions: [{ evaluate: jsSnippet }] }),
      extract_rules: JSON.stringify({ blocks: { selector: "#__qc_blocks__", output: "text" } }),
      // Ask ScrapingBee to return JSON so we get both screenshot + extracted data.
      json_response: "true",
    });

    const beeResp = await fetch(`https://app.scrapingbee.com/api/v1/?${params.toString()}`);
    if (!beeResp.ok) {
      const detail = await beeResp.text().catch(() => "");
      throw new Error(`Scraping service returned ${beeResp.status}. ${detail.slice(0, 200)}`);
    }

    const payload = await beeResp.json();
    // With json_response=true, ScrapingBee returns an object containing the
    // screenshot (base64) and the evaluated results.
    const screenshot = payload.screenshot || payload.screenshot_full_page || null;
    let meta = { pageWidth: 0, pageHeight: 0, blocks: [] };
    try {
      const raw = payload.body && payload.body.blocks ? payload.body.blocks : (payload.blocks || "");
      if (raw) meta = JSON.parse(raw);
    } catch (_) {}

    if (!screenshot) {
      throw new Error("Preview screenshot was not returned by the scraping service.");
    }

    res.status(200).json({
      screenshot, // base64 PNG (no data: prefix, or with — frontend handles both)
      pageWidth: meta.pageWidth,
      pageHeight: meta.pageHeight,
      blocks: meta.blocks,
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to build preview: ${err.message}` });
  }
}
