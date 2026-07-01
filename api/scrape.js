/**
 * Serverless function: given ?url=..., fetches fully-rendered page text via
 * ScrapingBee (hosted headless browser). No local Chromium.
 *
 * Optional scoping:
 *   ?include=selector1,selector2  -> only extract text inside these containers
 *   ?exclude=selectorA,selectorB  -> remove these before extracting (e.g. nav, footer)
 *
 * Requires env var SCRAPINGBEE_API_KEY (Vercel -> Settings -> Environment Variables).
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

  const splitSel = (s) =>
    (s || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  const includeSelectors = splitSel(req.query.include);
  const excludeSelectors = splitSel(req.query.exclude);

  try {
    // We fetch full rendered HTML and do the scoping ourselves via a small
    // JS snippet ScrapingBee runs in the page. This gives precise include/
    // exclude control that extract_rules alone can't express.
    const jsSnippet = `
      (function() {
        var excludes = ${JSON.stringify(excludeSelectors)};
        excludes.forEach(function(sel) {
          try { document.querySelectorAll(sel).forEach(function(n){ n.remove(); }); } catch(e){}
        });
        var includes = ${JSON.stringify(includeSelectors)};
        var roots = [];
        if (includes.length) {
          includes.forEach(function(sel) {
            try { document.querySelectorAll(sel).forEach(function(n){ roots.push(n); }); } catch(e){}
          });
        } else {
          roots = [document.body];
        }
        function visibleText(root) {
          if (!root) return "";
          var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
          var chunks = [], node;
          while ((node = walker.nextNode())) {
            var el = node.parentElement;
            if (!el) continue;
            var st = window.getComputedStyle(el);
            if (st.display === "none" || st.visibility === "hidden" || el.offsetParent === null) continue;
            var t = node.textContent.trim();
            if (t) chunks.push(t);
          }
          return chunks.join("\\n");
        }
        var out = roots.map(visibleText).filter(Boolean).join("\\n");
        // Stash result where we can read it back out via extract_rules.
        var holder = document.createElement("div");
        holder.id = "__qc_extracted__";
        holder.style.display = "none";
        holder.textContent = out;
        document.body.appendChild(holder);
      })();
    `;

    const params = new URLSearchParams({
      api_key: apiKey,
      url,
      render_js: "true",
      wait_browser: "networkidle2",
      js_scenario: JSON.stringify({ instructions: [{ evaluate: jsSnippet }] }),
      extract_rules: JSON.stringify({
        text: { selector: "#__qc_extracted__", output: "text" },
      }),
    });

    const beeResp = await fetch(`https://app.scrapingbee.com/api/v1/?${params.toString()}`);
    if (!beeResp.ok) {
      const detail = await beeResp.text().catch(() => "");
      throw new Error(`Scraping service returned ${beeResp.status}. ${detail.slice(0, 200)}`);
    }

    const data = await beeResp.json();
    const text = typeof data === "string" ? data : data.text || "";

    // If include selectors matched nothing, tell the user rather than silently
    // returning an empty (all-missing) result.
    if (includeSelectors.length && !text.trim()) {
      res.status(200).json({
        text: "",
        warning:
          "Your include selector(s) didn't match any content on the page. Check the selector, or leave the field blank to scan the whole page.",
      });
      return;
    }

    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: `Failed to load page: ${err.message}` });
  }
}
