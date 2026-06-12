// Mission Control usage telemetry — injectable-store tests.
import test from "node:test";
import assert from "node:assert/strict";
import { track, usageSummary, MC_KEYS, trackFiling, filingEvents, filingImpactReport } from "../src/telemetry.js";

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

test("track: increments per key, per user, and survives repeat clicks", () => {
  const s = memStore();
  assert.equal(track(s, "u1", "risk.inspect", 1000), 1);
  assert.equal(track(s, "u1", "risk.inspect", 2000), 2);
  assert.equal(track(s, "u1", "opp.logTrade", 3000), 1);
  assert.equal(track(s, "u2", "risk.inspect", 4000), 1); // separate user bucket
});

test("usageSummary: most-clicked first, never-clicked listed, totals correct", () => {
  const s = memStore();
  track(s, "u1", "opp.logTrade", 1); track(s, "u1", "opp.logTrade", 2); track(s, "u1", "opp.logTrade", 3);
  track(s, "u1", "risk.inspect", 4);
  const sum = usageSummary(s, "u1");
  assert.equal(sum.total, 4);
  assert.equal(sum.clicked[0].key, "opp.logTrade");
  assert.equal(sum.clicked[0].count, 3);
  assert.ok(sum.never.includes("council.open"));
  assert.ok(!sum.never.includes("risk.inspect"));
  assert.equal(sum.since, 1); // stamped on first event
});

test("telemetry is corruption-safe and empty-safe", () => {
  const broken = { getItem: () => "{not json", setItem: () => { throw new Error("quota"); } };
  assert.equal(track(broken, "u1", "x"), 0);
  const sum = usageSummary(broken, "u1");
  assert.equal(sum.total, 0);
  assert.deepEqual(sum.never, MC_KEYS);
  const empty = usageSummary(memStore(), "u1");
  assert.equal(empty.total, 0);
  assert.equal(empty.since, null);
});

test("trackFiling: appends valid events, ignores unknown types, separate stream", () => {
  const s = memStore();
  trackFiling(s, "u1", "filing_read_manual", { ticker: "NVDA", accession: "001", sectionsRead: ["MD&A"], sectionsSkipped: ["Legal"] }, 1000);
  trackFiling(s, "u1", "not_a_real_event", { ticker: "X" }, 1100); // ignored
  trackFiling(s, "u1", "research_used_digest", { ticker: "NVDA" }, 1200);
  const ev = filingEvents(s, "u1");
  assert.equal(ev.length, 2);
  assert.equal(ev[0].type, "filing_read_manual");
  assert.equal(ev[0].ticker, "NVDA");
  assert.equal(filingEvents(s, "u2").length, 0); // per-user
});

test("filingImpactReport aggregates reads, attribution, verdict changes and section value", () => {
  const s = memStore();
  trackFiling(s, "u1", "filing_read_manual", { ticker: "NVDA", sectionsRead: ["MD&A", "Risk Factors"], sectionsSkipped: ["Financial Statements"] }, 1000);
  trackFiling(s, "u1", "filing_read_council", { ticker: "AMD", sectionsRead: ["MD&A"], sectionsSkipped: ["Financial Statements", "Legal Proceedings"] }, 2000);
  trackFiling(s, "u1", "filing_read_manual", { ticker: "NVDA", sectionsRead: ["MD&A"], sectionsSkipped: [] }, 3000);
  trackFiling(s, "u1", "filing_digest_opened", { ticker: "NVDA" }, 3100);
  trackFiling(s, "u1", "research_used_facts", { ticker: "NVDA" }, 3200);
  trackFiling(s, "u1", "research_used_digest", { ticker: "NVDA" }, 3300);
  trackFiling(s, "u1", "council_verdict_changed_after_filing", { ticker: "NVDA", from: "Neutral", to: "Buy" }, 3400);
  trackFiling(s, "u1", "trade_created_after_filing", { ticker: "NVDA" }, 3500);

  const r = filingImpactReport(s, "u1", 3500 + 2 * 864e5); // ~2 days later
  assert.equal(r.totalReads, 3);
  assert.equal(r.manualReads, 2);
  assert.equal(r.councilReads, 1);
  assert.equal(r.digestOpens, 1);
  assert.equal(r.mostResearched[0].key, "NVDA");
  assert.equal(r.mostResearched[0].count, 2);
  assert.equal(r.researchUsedFacts, 1);
  assert.equal(r.researchUsedDigest, 1);
  assert.equal(r.verdictChanges.length, 1);
  assert.deepEqual(r.verdictChanges[0], { ticker: "NVDA", from: "Neutral", to: "Buy", at: 3400 });
  assert.deepEqual(r.tradesAfterFiling, ["NVDA"]);
  assert.equal(r.sectionsRead[0].key, "MD&A");     // most-read section
  assert.equal(r.sectionsRead[0].count, 3);
  assert.equal(r.sectionsSkipped[0].key, "Financial Statements"); // most-skipped
  assert.equal(r.sectionsSkipped[0].count, 2);
  assert.equal(r.since, 1000);
  assert.equal(r.days, 2);
});

test("filingImpactReport is empty-safe", () => {
  const r = filingImpactReport(memStore(), "u1", 1000);
  assert.equal(r.totalReads, 0);
  assert.equal(r.since, null);
  assert.deepEqual(r.verdictChanges, []);
  assert.deepEqual(r.sectionsRead, []);
});
