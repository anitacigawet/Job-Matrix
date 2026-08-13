import DOMPurify from "dompurify";

/**
 * Many job descriptions arrive as a mix of HTML, markdown, and markdown-escaped
 * plain text — the same `**bold**` / `\-` / `* bullet` patterns that markdown
 * editors emit. Process the markdown patterns into HTML first, then hand to
 * DOMPurify which strips anything dangerous.
 */
function processMarkdownPatterns(content: string): string {
  if (!content) return "";
  let result = content;

  // 1. Unescape markdown character escapes (`\-` → `-`, `\|` → `|`, etc.)
  result = result.replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, "$1");

  // 2. **bold** → <strong>bold</strong>
  result = result.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");

  // 3. _italic_ → <em>italic</em>, only when the underscore is at a word boundary
  //    (so `user_name` and similar identifiers aren't touched).
  result = result.replace(
    /(^|[\s(])_([^_\n]+?)_(?=[\s).,;:!?]|$)/g,
    "$1<em>$2</em>",
  );

  // 4. Convert markdown bullet lines (`* foo` / `- foo`) into <ul><li> runs.
  //    Block-aware so consecutive bullets share one <ul>.
  const lines = result.split("\n");
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const m = line.match(/^\s*[*\-]\s+(.+)$/);
    if (m) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${m[1]}</li>`);
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(line);
    }
  }
  if (inList) out.push("</ul>");
  result = out.join("\n");

  // 5. Blank-line separated paragraphs become <p>…</p>. Block elements are
  //    left alone so we don't wrap a <ul> inside a <p>.
  result = result
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      if (/^<(ul|ol|h[1-6]|p|div|table|blockquote|pre|hr|li)\b/i.test(p)) return p;
      return `<p>${p.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");

  return result;
}

/**
 * Sanitize HTML content from job descriptions to prevent XSS attacks.
 * Allows safe formatting tags but strips scripts, event handlers, etc.
 * Markdown patterns in the source are converted to HTML first.
 */
export function sanitizeJobDescription(content: string): string {
  // Add a hook to force target="_blank" and rel="noopener" on all links
  DOMPurify.addHook("afterSanitizeAttributes", function (node) {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener");
    }
  });

  try {
    const withMarkdown = processMarkdownPatterns(content);
    const sanitized = DOMPurify.sanitize(withMarkdown, {
      ALLOWED_TAGS: [
        "p", "br", "b", "strong", "i", "em", "u", "s", "strike",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "ul", "ol", "li",
        "a", "span", "div",
        "table", "thead", "tbody", "tr", "th", "td",
        "blockquote", "pre", "code",
        "hr", "img",
      ],
      ALLOWED_ATTR: [
        "href", "target", "rel", "class", "style",
        "src", "alt", "width", "height",
      ],
      // Force all links to open in new tab with noopener
      ADD_ATTR: ["target", "rel"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
    });

    return sanitized;
  } finally {
    // Clean up hook to avoid side effects on other calls if any
    DOMPurify.removeHook("afterSanitizeAttributes");
  }
}

/**
 * Strip all HTML tags and return plain text.
 * Useful for search indexing and preview text.
 */
export function stripHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });
}

/**
 * Compact one-line role summary for the dashboard job-card preview. The raw
 * description usually opens with `**TITLE | LOCATION**` + `**Pay: $X**` header
 * lines before the real prose; the heuristic skips those and returns the first
 * descriptive sentence, with markdown stripped and the result truncated to a
 * sensible card length.
 */
export function rolePreview(description: string | null | undefined, maxLen = 180): string {
  if (!description) return "";

  // Strip HTML tags first so we work in plain text.
  let text = description.replace(/<[^>]+>/g, " ");

  // Unescape markdown escapes so they don't leak into the preview.
  text = text.replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, "$1");

  // Walk the leading lines, skipping anything that's purely a header line
  // (entirely bold-wrapped, or a "Pay:" / "Location:" / similar label).
  const lines = text.split("\n").map((l) => l.trim());
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      i++;
      continue;
    }
    const boldOnly = /^\*\*[^*\n]+\*\*$/.test(line);
    const labelLine = /^(\*\*)?(pay|salary|wage|compensation|location|hours|schedule|job\s*type|employment\s*type|benefits)\s*[:.]/i.test(
      line,
    );
    if (boldOnly || labelLine) {
      i++;
      continue;
    }
    break;
  }

  // Strip-markdown helper, reused for both the prose body and the
  // all-headers fallback below.
  const stripMd = (s: string) =>
    s
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/^#+\s+/gm, "")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();

  // The remaining lines are the actual prose body — collapse to one buffer.
  let prose = stripMd(lines.slice(i).join(" "));

  // If the description was nothing but headers ("**TITLE**\n**Pay: $X**"),
  // the prose-walker drops everything and we'd render an empty card.
  // Fall back to the full description with markdown stripped so the user
  // at least sees the title / pay / location they would have seen
  // otherwise.
  if (!prose) {
    prose = stripMd(text);
    if (!prose) return "";
  }

  // First sentence — or first two if the first is unusually short.
  const sentences = prose.split(/(?<=[.!?])\s+/);
  let head = sentences[0] ?? prose;
  if (head.length < 50 && sentences[1]) {
    head = head + " " + sentences[1];
  }

  if (head.length <= maxLen) return head;

  // Truncate at the nearest word boundary so we don't cut "Fron…"-style.
  const cutoff = head.lastIndexOf(" ", maxLen - 1);
  const trimmed = cutoff > maxLen - 40 ? head.slice(0, cutoff) : head.slice(0, maxLen - 1);
  return trimmed.replace(/[\s.,;:!?]+$/, "") + "…";
}
