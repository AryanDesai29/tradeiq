// ─── FILING TEXT INTELLIGENCE (P3.2b, pure) — read filings, don't just index ──
//
// The pure half of the ingestion pipeline (api/ingest.js owns download + the LLM
// map-reduce). Here: strip an EDGAR iXBRL/HTML primary document to plain text,
// split it into canonical sections (TOC-aware — the FIRST heading hit is the
// table of contents, so we take the LAST), prioritise the high-value narrative
// (MD&A → Risk Factors), chunk under a hard cap, and normalise the resulting
// Filing Digest with the same clamp discipline as normalizeBrief/normalizeSession.
//
// Anti-hallucination contract: every digest item carries section provenance,
// quotes are verbatim, and skipped sections are listed — so the app can say
// "the ingested sections don't mention X", never "the filing doesn't mention X".

const str = (v, max = 280) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strArr = (a, max = 8, len = 280) => (Array.isArray(a) ? a.map((x) => str(x, len)).filter(Boolean).slice(0, max) : []);

// ── Text extraction ──────────────────────────────────────────────────────────
// EDGAR primary documents strip cleanly without an HTML parser (measured P3.2):
// drop script/style, then tags, decode the handful of entities that survive,
// collapse whitespace. Pure string ops — no npm dependency.
export function stripFilingText(html) {
  if (typeof html !== "string" || !html) return "";
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|tr|h[1-6]|li|table|section)>/gi, "\n") // keep block boundaries as newlines
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#8217;|&rsquo;|&#x2019;/gi, "’").replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#8212;|&mdash;/gi, "—").replace(/&#?[a-z0-9]+;/gi, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim();
}

// Canonical narrative sections we extract, in priority order. The regex matches
// the heading; ingestion uses the LAST occurrence (the first is the TOC entry).
const SECTION_MARKERS = [
  { key: "MD&A", re: /management[’'’]?s discussion and analysis/gi },
  { key: "Risk Factors", re: /risk factors/gi },
  { key: "Quantitative and Qualitative Disclosures", re: /quantitative and qualitative disclosures about market risk/gi },
];

const lastIndexOfAll = (text, re) => {
  let m, at = -1;
  re.lastIndex = 0;
  while ((m = re.exec(text))) at = m.index;
  return at;
};

// Split stripped text into recognised sections. Each section spans from its
// (last) heading to the next section's heading in document order. Sections under
// `minChars` are dropped as TOC false-positives. No recognised heading → the
// whole document is returned as one "Full Document" section.
export function splitSections(text, minChars = 1500) {
  if (typeof text !== "string" || text.length < minChars) {
    return text ? [{ key: "Full Document", text: String(text) }] : [];
  }
  const marks = SECTION_MARKERS
    .map((m) => ({ key: m.key, at: lastIndexOfAll(text, m.re) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at);
  if (!marks.length) return [{ key: "Full Document", text }];

  const sections = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].at;
    const end = i + 1 < marks.length ? marks[i + 1].at : text.length;
    const body = text.slice(start, end).trim();
    if (body.length >= minChars) sections.push({ key: marks[i].key, text: body });
  }
  return sections.length ? sections : [{ key: "Full Document", text }];
}

// Priority for ingestion: MD&A first (forward-looking narrative + numbers),
// then Risk Factors, then anything else. Boilerplate never reaches here because
// only the markers above are recognised.
const PRIORITY = { "MD&A": 0, "Risk Factors": 1, "Quantitative and Qualitative Disclosures": 2, "Full Document": 0 };
export function prioritizeSections(sections) {
  return [...(Array.isArray(sections) ? sections : [])]
    .filter((s) => s && typeof s.text === "string" && s.text.length)
    .sort((a, b) => (PRIORITY[a.key] ?? 9) - (PRIORITY[b.key] ?? 9));
}

// Chunk prioritised sections into ≤ maxChunks pieces of ~chunkChars each. Returns
// the chunks to read PLUS an honesty manifest: what was ingested and what was
// skipped because the cap was hit (so the digest can list `not_ingested`).
export function planChunks(sections, { chunkChars = 14000, maxChunks = 8 } = {}) {
  const prioritized = prioritizeSections(sections);
  const chunks = [];
  const ingested = [];   // [{section, chunks, chars}]
  const skipped = [];    // section keys (or partials) not read
  for (const sec of prioritized) {
    if (chunks.length >= maxChunks) { skipped.push(sec.key); continue; }
    let used = 0, n = 0;
    for (let i = 0; i < sec.text.length && chunks.length < maxChunks; i += chunkChars) {
      chunks.push({ section: sec.key, text: sec.text.slice(i, i + chunkChars) });
      used += Math.min(chunkChars, sec.text.length - i); n++;
    }
    ingested.push({ section: sec.key, chunks: n, chars: used });
    if (used < sec.text.length) skipped.push(`${sec.key} (truncated — ${sec.text.length - used} chars beyond cap)`);
  }
  return { chunks, manifest: { ingested, skipped } };
}

// ── Filing Digest normalisation ───────────────────────────────────────────────
// The REDUCE step's JSON is never trusted raw. Drops items without section
// provenance where the contract requires it; clamps lengths; caps list sizes.
function quoteList(a, max = 6) {
  if (!Array.isArray(a)) return [];
  return a.map((q) => (q && typeof q === "object" ? { text: str(q.text, 200), section: str(q.section, 40) } : null))
    .filter((q) => q && q.text).slice(0, max);
}

export function normalizeDigest(raw, meta = {}) {
  if (!raw || typeof raw !== "object") return null;
  const digest = {
    summary: str(raw.summary, 600),
    guidance: strArr(raw.guidance),
    revenue_drivers: strArr(raw.revenue_drivers),
    margin_commentary: strArr(raw.margin_commentary),
    risk_changes: strArr(raw.risk_changes),
    competitive: strArr(raw.competitive),
    segment_notes: strArr(raw.segment_notes),
    red_flags: strArr(raw.red_flags),
    quotes: quoteList(raw.quotes),
    not_ingested: strArr(raw.not_ingested, 12, 160),
    evidence_note: str(raw.evidence_note, 200),
    // Provenance carried for citation + the permanent cache key.
    form: str(meta.form ?? raw.form, 12),
    filed: str(meta.filed ?? raw.filed, 12),
    accession: str(meta.accession ?? raw.accession, 40),
  };
  // Nothing substantive extracted → no digest (honest, not an empty shell).
  const substance = digest.summary || digest.guidance.length || digest.risk_changes.length ||
    digest.revenue_drivers.length || digest.margin_commentary.length || digest.quotes.length;
  return substance ? digest : null;
}

export const hasDigest = (d) => !!(d && (d.summary || (d.quotes && d.quotes.length) || (d.guidance && d.guidance.length)));

// From an opportunity's embedded {accession: digest} map, the most recently
// filed digest — what research and the Council should cite by default.
export function latestDigest(map) {
  if (!map || typeof map !== "object") return null;
  const ds = Object.values(map).filter(hasDigest);
  if (!ds.length) return null;
  return ds.sort((a, b) => String(a.filed || "").localeCompare(String(b.filed || ""))).pop();
}

export const digestCount = (map) => (map && typeof map === "object" ? Object.values(map).filter(hasDigest).length : 0);

// ≤1200-char prompt block for api/research + Council. Cites as
// [FACT, 10-Q 2025-07-31, MD&A]; the skipped-sections line keeps the honesty
// contract travelling with the data. Empty when there is nothing to add.
export function digestBlock(d, maxLen = 1200) {
  if (!hasDigest(d)) return "";
  const tag = `${d.form || "filing"}${d.filed ? ` ${d.filed}` : ""}`;
  const out = [`FILING DIGEST [FACT, ${tag}] — read from the filing's own text (cite as fact, with its section):`];
  if (d.summary) out.push(d.summary);
  const sec = (label, arr) => { if (arr && arr.length) out.push(`${label}: ${arr.slice(0, 3).join(" · ")}`); };
  sec("GUIDANCE", d.guidance);
  sec("REVENUE DRIVERS", d.revenue_drivers);
  sec("MARGIN COMMENTARY", d.margin_commentary);
  sec("RISK CHANGES", d.risk_changes);
  sec("RED FLAGS", d.red_flags);
  if (d.quotes && d.quotes.length) out.push(`QUOTE [${d.quotes[0].section || "filing"}]: "${d.quotes[0].text}"`);
  if (d.not_ingested && d.not_ingested.length) out.push(`NOT READ (do not claim the filing is silent on these): ${d.not_ingested.slice(0, 3).join("; ")}`);
  return out.join("\n").slice(0, maxLen);
}

// Compact one-liner for the Council context (≤240 chars).
export function digestLine(d) {
  if (!hasDigest(d)) return "";
  const tag = `${d.form || "filing"}${d.filed ? ` ${d.filed}` : ""}`;
  return `Read ${tag}: ${str(d.summary || (d.guidance && d.guidance[0]) || "", 200)}`.slice(0, 240);
}
