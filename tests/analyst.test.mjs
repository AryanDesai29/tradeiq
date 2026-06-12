import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TASK_TYPES, makeTask, taskId, classifyResearchItem, defaultTasks,
  tasksFromCouncil, mergeTasks, taskProgress, researchDone, queuedTasks,
  applyFindings, normalizeBrief,
} from "../src/analyst.js";

const AT = "2026-06-12T00:00:00.000Z";

test("makeTask validates, classifies untyped questions, and ids are stable", () => {
  const t = makeTask({ type: "risk", question: "  What breaks this?  ", source: "council" }, AT);
  assert.equal(t.type, "risk");
  assert.equal(t.question, "What breaks this?");
  assert.equal(t.source, "council");
  assert.equal(t.status, "queued");
  assert.equal(t.id, taskId("risk", "What breaks this?"));
  assert.equal(makeTask({ question: "" }), null);
  // Unknown type → classified from the text; unknown source → user.
  const c = makeTask({ type: "wizardry", question: "Who are the competitors?", source: "alien" });
  assert.equal(c.type, "competitive");
  assert.equal(c.source, "user");
});

test("classifyResearchItem maps council vocabulary to task types", () => {
  assert.equal(classifyResearchItem("Supplier demand data"), "industry");
  assert.equal(classifyResearchItem("Competitive positioning"), "competitive");
  assert.equal(classifyResearchItem("Margin outlook"), "risk");
  assert.equal(classifyResearchItem("What is priced in by consensus?"), "expectations");
  assert.equal(classifyResearchItem("Evidence that supports the thesis"), "thesis_validation");
  assert.equal(classifyResearchItem("Tell me about the firm"), "company");
});

test("defaultTasks is the full 6-type playbook templated with the thesis", () => {
  const tasks = defaultTasks({ ticker: "NVDA", market_expectations: "AI capex slows", invalidation: "guide cut", reality_hypothesis: "capex accelerating" }, AT);
  assert.equal(tasks.length, 6);
  assert.deepEqual([...new Set(tasks.map((t) => t.type))].sort(), [...TASK_TYPES].sort());
  assert.ok(tasks.every((t) => t.question.includes("NVDA") || t.question.includes("capex") || t.question.includes("guide cut")));
  assert.ok(tasks.every((t) => t.source === "auto" && t.status === "queued"));
});

test("tasksFromCouncil turns demands, holds and red flags into queued tasks", () => {
  const session = {
    verdict: { required_research: ["Competitive positioning", "Margin outlook"] },
    evidence_hold: { raised: true, demand: "Supplier demand data" },
    red_flags: { raised: true, flags: ["Confidence not supported by evidence"] },
  };
  const tasks = tasksFromCouncil(session, AT);
  assert.equal(tasks.length, 4);
  assert.ok(tasks.every((t) => t.source === "council" && t.status === "queued"));
  assert.equal(tasksFromCouncil(null).length, 0);
  // Unraised powers contribute nothing.
  assert.equal(tasksFromCouncil({ verdict: { required_research: [] }, evidence_hold: { raised: false, demand: "x" }, red_flags: { raised: false, flags: ["y"] } }).length, 0);
});

test("mergeTasks dedupes by id and never resets completed work", () => {
  const a = makeTask({ type: "risk", question: "What breaks this?" }, AT);
  const done = { ...a, status: "done", finding: "answered" };
  const dup = makeTask({ type: "risk", question: "what breaks   this?" }, AT); // same id after normalization
  const merged = mergeTasks([done], [dup, makeTask({ type: "company", question: "What does it do?" }, AT)]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((t) => t.id === a.id).status, "done"); // existing wins
});

test("taskProgress / researchDone / queuedTasks", () => {
  const q = makeTask({ type: "company", question: "q1" }, AT);
  const d = { ...makeTask({ type: "risk", question: "q2" }, AT), status: "done" };
  const f = { ...makeTask({ type: "industry", question: "q3" }, AT), status: "failed" };
  assert.deepEqual(taskProgress([q, d, f]), { total: 3, done: 2, pct: 2 / 3 });
  assert.equal(researchDone([d, f]), true);
  assert.equal(researchDone([q, d]), false);
  assert.equal(researchDone([]), false); // no tasks ≠ research complete
  assert.deepEqual(queuedTasks([q, d, f]), [q]);
});

test("applyFindings completes matched tasks only; blanks never overwrite", () => {
  const t1 = makeTask({ type: "company", question: "q1" }, AT);
  const t2 = makeTask({ type: "risk", question: "q2" }, AT);
  const out = applyFindings([t1, t2], [{ id: t1.id, summary: "[FACT] It makes GPUs." }, { id: t2.id, summary: "" }, { id: "nope", summary: "x" }], AT);
  assert.equal(out[0].status, "done");
  assert.equal(out[0].finding, "[FACT] It makes GPUs.");
  assert.equal(out[0].completed_at, AT);
  assert.equal(out[1].status, "queued"); // empty summary → still unanswered
});

test("normalizeBrief clamps every section and rejects empty summaries", () => {
  const b = normalizeBrief({
    executive_summary: "  Solid setup, weak evidence. ",
    key_findings: ["a", "", 42, "b"],
    unknowns: Array.from({ length: 20 }, (_, i) => `u${i}`), // capped at 8
    evidence_strength: 250, research_confidence: -5,
    bull_case: "x".repeat(900),
  });
  assert.equal(b.executive_summary, "Solid setup, weak evidence.");
  assert.deepEqual(b.key_findings, ["a", "b"]);
  assert.equal(b.unknowns.length, 8);
  assert.equal(b.evidence_strength, 100);
  assert.equal(b.research_confidence, 0);
  assert.equal(b.bull_case.length, 300);
  assert.ok(Array.isArray(b.council_questions));
  assert.equal(normalizeBrief({ executive_summary: "" }), null);
  assert.equal(normalizeBrief("nope"), null);
});
