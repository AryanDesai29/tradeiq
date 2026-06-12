import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeNews, normalizeFilings, buildSources, sourcesBlock, sourceCount } from "../src/sources.js";

const AT = "2026-06-12T00:00:00.000Z";

test("normalizeNews keeps only dated+titled items, converts unix time, caps", () => {
  const out = normalizeNews([
    { title: "NVIDIA beats expectations", publisher: "Reuters", providerPublishTime: 1765500000, link: "https://reut.rs/x" },
    { title: "", publisher: "Bloomberg", providerPublishTime: 1765500000 },        // no title → dropped
    { title: "Undated rumor", publisher: "Blog" },                                  // no date → dropped
    { title: "Bad link survives without one", providerPublishTime: 1765500000, link: "javascript:alert(1)" },
    ...Array.from({ length: 12 }, (_, i) => ({ title: `n${i}`, providerPublishTime: 1765500000 + i })),
  ]);
  assert.equal(out.length, 8); // cap
  assert.equal(out[0].title, "NVIDIA beats expectations");
  assert.match(out[0].at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(out[1].link, ""); // non-http link sanitized away
  assert.equal(normalizeNews(null).length, 0);
});

test("normalizeFilings requires form+date, sanitizes links, caps at 10", () => {
  const out = normalizeFilings([
    { form: "10-Q", filed: "2026-05-02", title: "Quarterly report", link: "https://www.sec.gov/x" },
    { form: "", filed: "2026-05-02" },     // dropped
    { form: "8-K", filed: "" },            // dropped
    ...Array.from({ length: 15 }, (_, i) => ({ form: "8-K", filed: `2026-04-${String(i + 1).padStart(2, "0")}` })),
  ]);
  assert.equal(out.length, 10);
  assert.equal(out[0].form, "10-Q");
  assert.equal(out[0].link, "https://www.sec.gov/x");
});

test("buildSources assembles the storable object; sourceCount totals both", () => {
  const s = buildSources({
    news: [{ title: "t", providerPublishTime: 1765500000 }],
    filings: [{ form: "10-K", filed: "2026-02-01" }],
    note: "ignored when filings exist",
  }, AT);
  assert.equal(s.news.length, 1);
  assert.equal(s.filings.length, 1);
  assert.equal(s.fetched_at, AT);
  assert.equal(sourceCount(s), 2);
  assert.equal(sourceCount(null), 0);
  assert.equal(sourceCount(buildSources({}, AT)), 0);
});

test("sourcesBlock cites dated items, carries the honesty rules, empty when bare", () => {
  const s = buildSources({
    news: [{ title: "NVIDIA beats", publisher: "Reuters", at: "2026-06-10T08:00:00Z" }],
    filings: [{ form: "10-Q", filed: "2026-05-02", title: "Quarterly report" }],
  }, AT);
  const block = sourcesBlock(s);
  assert.match(block, /VERIFIED SOURCES/);
  assert.match(block, /\[2026-06-10\] Reuters: "NVIDIA beats"/);
  assert.match(block, /10-Q filed 2026-05-02 — Quarterly report/);
  assert.match(block, /UNREAD/); // contents-unread rule travels with the data
  assert.equal(sourcesBlock(buildSources({}, AT)), "");
  assert.equal(sourcesBlock(null), "");
});

test("sourcesBlock surfaces the filings note for non-SEC listings", () => {
  const s = buildSources({
    news: [{ title: "Reliance expands retail", publisher: "ET", at: "2026-06-11T08:00:00Z" }],
    filings: [],
    note: "Indian listings file with NSE/BSE, not the SEC — check the exchange announcements page directly.",
  }, AT);
  assert.match(sourcesBlock(s), /FILINGS: Indian listings file with NSE\/BSE/);
});
