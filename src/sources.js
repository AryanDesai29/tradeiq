// ─── RESEARCH SOURCES (P3.1, pure) — real news + filings for the analyst ──────
//
// The Research Analyst Engine's first REAL external data: dated news headlines
// (Yahoo, via api/news.js) and the SEC EDGAR filings index (api/filings.js).
// This module normalizes both into storable shapes and renders the prompt
// block. The honesty contract is explicit in the block itself: headline text
// and filing existence/dates are FACTS the model may cite; article/filing
// CONTENTS are unread — anything beyond the headline stays ASSUMPTION/UNKNOWN.

const str = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const httpLink = (v) => (typeof v === "string" && /^https?:\/\//.test(v) ? v.slice(0, 400) : "");

// Yahoo search news item → {title, publisher, at(ISO), link}. Drops undated or
// untitled entries — an uncitable source is worse than no source.
export function normalizeNews(rawArr, max = 8) {
  if (!Array.isArray(rawArr)) return [];
  const out = [];
  for (const n of rawArr) {
    if (!n || typeof n !== "object") continue;
    const title = str(n.title, 160);
    const ts = Number(n.providerPublishTime);
    const at = typeof n.at === "string" ? str(n.at, 30) : Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : "";
    if (!title || !at) continue;
    out.push({ title, publisher: str(n.publisher, 40), at, link: httpLink(n.link) });
    if (out.length >= max) break;
  }
  return out;
}

// EDGAR filing entry → {form, filed(YYYY-MM-DD), title, link}.
export function normalizeFilings(rawArr, max = 10) {
  if (!Array.isArray(rawArr)) return [];
  const out = [];
  for (const f of rawArr) {
    if (!f || typeof f !== "object") continue;
    const form = str(f.form, 12), filed = str(f.filed, 12);
    if (!form || !filed) continue;
    out.push({ form, filed, title: str(f.title, 120), link: httpLink(f.link) });
    if (out.length >= max) break;
  }
  return out;
}

// Assemble the storable sources object (saved to research_sources jsonb).
export function buildSources({ news, filings, note } = {}, at = "") {
  return {
    news: normalizeNews(news),
    filings: normalizeFilings(filings),
    filings_note: str(note, 160),
    fetched_at: at || "",
  };
}

export const sourceCount = (s) => (s ? (s.news?.length || 0) + (s.filings?.length || 0) : 0);

// Prompt block for api/research.js — dated, citable, honesty rules inline.
// Empty string when there is nothing real to cite (the engine then falls back
// to its no-sources discipline instead of pretending).
export function sourcesBlock(s) {
  if (!sourceCount(s)) return "";
  const out = ["VERIFIED SOURCES (fetched live — real and dated; cite them):"];
  if (s.news?.length) {
    out.push("NEWS HEADLINES (headline text + date = FACT; article contents UNREAD — do not invent what's inside):");
    for (const n of s.news) out.push(`- [${n.at.slice(0, 10)}] ${n.publisher ? n.publisher + ": " : ""}"${n.title}"`);
  }
  if (s.filings?.length) {
    out.push("SEC FILINGS INDEX (existence/form/date = FACT; contents UNREAD — point the user at the specific filing):");
    for (const f of s.filings) out.push(`- ${f.form} filed ${f.filed}${f.title ? ` — ${f.title}` : ""}`);
  } else if (s.filings_note) {
    out.push(`FILINGS: ${s.filings_note}`);
  }
  return out.join("\n").slice(0, 1900);
}
