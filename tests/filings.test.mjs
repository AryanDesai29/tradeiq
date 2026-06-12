import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stripFilingText, splitSections, prioritizeSections, planChunks,
  normalizeDigest, digestBlock, digestLine, hasDigest,
} from "../src/filings.js";

test("stripFilingText drops script/style, tags, decodes entities, collapses whitespace", () => {
  const html = `<html><head><style>.x{color:red}</style><script>evil()</script></head>
    <body><p>Revenue&nbsp;rose&nbsp;20%</p><div>AT&amp;T &lt;competes&gt; &#8220;hard&#8221;</div></body></html>`;
  const t = stripFilingText(html);
  assert.doesNotMatch(t, /evil\(\)/);             // script gone
  assert.doesNotMatch(t, /color:red/);            // style gone
  assert.doesNotMatch(t, /<(p|div|html|body|script|style)\b/i); // no real HTML tags survive
  assert.match(t, /Revenue rose 20%/);
  assert.match(t, /AT&T/);                // &amp; decoded
  assert.match(t, /"hard"/);              // smart quotes decoded
  assert.equal(stripFilingText(null), "");
});

// Synthetic 10-Q: a table of contents (FIRST heading occurrence) followed by the
// real body (LAST occurrence). The splitter must take the LAST.
const toc = "TABLE OF CONTENTS\nItem 2. Management's Discussion and Analysis ... 12\nItem 1A. Risk Factors ... 24\n" + "filler line.\n".repeat(40);
const mdaBody = "Management's Discussion and Analysis\n" + "Revenue increased 20% driven by data center demand. ".repeat(60);
const riskBody = "Risk Factors\n" + "Supply chain concentration in Taiwan remains a key risk. ".repeat(60);
const FILING = toc + mdaBody + riskBody;

test("splitSections takes the LAST heading (body, not TOC) and yields ordered sections", () => {
  const secs = splitSections(FILING);
  const keys = secs.map((s) => s.key);
  assert.deepEqual(keys, ["MD&A", "Risk Factors"]);
  const mda = secs.find((s) => s.key === "MD&A");
  assert.match(mda.text, /data center demand/);        // real body captured
  assert.doesNotMatch(mda.text, /TABLE OF CONTENTS/);  // TOC excluded
  assert.doesNotMatch(mda.text, /\.\.\. 12/);          // TOC dot-leader excluded
});

test("splitSections falls back to one Full Document section when no heading matches", () => {
  const plain = "Just some narrative text without canonical headings. ".repeat(60);
  const secs = splitSections(plain);
  assert.equal(secs.length, 1);
  assert.equal(secs[0].key, "Full Document");
  assert.deepEqual(splitSections(""), []);
  assert.deepEqual(splitSections("short"), [{ key: "Full Document", text: "short" }]);
});

test("prioritizeSections puts MD&A before Risk Factors regardless of input order", () => {
  const out = prioritizeSections([{ key: "Risk Factors", text: "r" }, { key: "MD&A", text: "m" }]);
  assert.deepEqual(out.map((s) => s.key), ["MD&A", "Risk Factors"]);
});

test("planChunks enforces the 8-chunk cap and records a skipped manifest", () => {
  const huge = "x".repeat(14000 * 12); // 12 chunks worth in one section
  const { chunks, manifest } = planChunks([{ key: "MD&A", text: huge }]);
  assert.equal(chunks.length, 8);                          // hard cap
  assert.equal(manifest.ingested[0].section, "MD&A");
  assert.ok(manifest.skipped.some((s) => /truncated/.test(s))); // honesty manifest
});

test("planChunks reads MD&A first, then Risk Factors, within the cap", () => {
  const { chunks } = planChunks(splitSections(FILING));
  assert.equal(chunks[0].section, "MD&A");
  assert.ok(chunks.some((c) => c.section === "Risk Factors"));
  assert.ok(chunks.length <= 8);
});

test("normalizeDigest clamps lengths, keeps quote provenance, merges meta, rejects empty", () => {
  const d = normalizeDigest({
    summary: "x".repeat(900),
    guidance: ["raised FY guide", "", 123, "y".repeat(400)],
    quotes: [{ text: "z".repeat(400), section: "MD&A" }, { text: "" }, "bad"],
    not_ingested: ["Financial Statements"],
  }, { form: "10-Q", filed: "2025-07-31", accession: "000123" });
  assert.equal(d.summary.length, 600);
  assert.equal(d.guidance.length, 2);            // blank + non-string dropped
  assert.equal(d.guidance[1].length, 280);       // clamped
  assert.equal(d.quotes.length, 1);              // empty/non-object dropped
  assert.equal(d.quotes[0].text.length, 200);    // verbatim clamp
  assert.equal(d.quotes[0].section, "MD&A");
  assert.equal(d.form, "10-Q");
  assert.equal(d.accession, "000123");
  assert.equal(normalizeDigest({}), null);       // no substance → no digest
  assert.equal(normalizeDigest(null), null);
});

test("digestBlock cites provenance, carries the not-read honesty line, caps length", () => {
  const d = normalizeDigest({
    summary: "Data center revenue drove the quarter; management raised full-year guidance.",
    guidance: ["FY revenue guide raised to ~$200B"],
    risk_changes: ["new export-control risk to China sales"],
    quotes: [{ text: "demand for our data center platform remains exceptional", section: "MD&A" }],
    not_ingested: ["Financial Statements", "Legal Proceedings"],
  }, { form: "10-Q", filed: "2025-07-31", accession: "000123" });
  const block = digestBlock(d);
  assert.match(block, /\[FACT, 10-Q 2025-07-31\]/);
  assert.match(block, /GUIDANCE: FY revenue guide raised/);
  assert.match(block, /QUOTE \[MD&A\]: "demand for our data center/);
  assert.match(block, /NOT READ .*Financial Statements/);
  assert.ok(block.length <= 1200);
  assert.equal(digestBlock(null), "");
});

test("hasDigest / digestLine gate on real content", () => {
  assert.equal(hasDigest(null), false);
  assert.equal(hasDigest({ summary: "" }), false);
  const d = { form: "10-Q", filed: "2025-07-31", summary: "Strong data center quarter." };
  assert.equal(hasDigest(d), true);
  assert.match(digestLine(d), /Read 10-Q 2025-07-31: Strong data center quarter/);
  assert.ok(digestLine(d).length <= 240);
});
