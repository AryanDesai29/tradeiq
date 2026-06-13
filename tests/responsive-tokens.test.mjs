// Phase 2 infrastructure guard — locks the responsive token invariants so a
// future edit can't silently reintroduce a sub-12px floor, a sub-44px target,
// or a stray breakpoint. Pure modules only (no React/DOM) to fit node --test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { T, SP, TOUCH } from "../src/theme.js";
import { BP, CLASSES, classifyWidth, mq, below, up } from "../src/breakpoints.js";

test("typography: 12px information floor holds", () => {
  // Information-bearing sizes must be ≥ 12.
  for (const k of ["caption", "data", "body", "h3", "h2", "h1", "display"]) {
    assert.ok(T[k] >= 12, `T.${k} (${T[k]}) must be ≥ 12px`);
  }
  assert.equal(T.caption, 12, "caption IS the information floor");
  // micro is decorative-only and must sit below caption (eyebrows), never used for data.
  assert.ok(T.micro < T.caption, "micro must be smaller than the caption floor");
  assert.ok(T.micro >= 11, "micro should not drop below 11");
});

test("type scale is strictly ordered micro < caption < data < body < h3 < h2 < h1 < display", () => {
  const order = [T.micro, T.caption, T.data, T.body, T.h3, T.h2, T.h1, T.display];
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `scale not increasing at index ${i}`);
});

test("touch target token is 44px (WCAG 2.5.5)", () => {
  assert.equal(TOUCH, 44);
});

test("spacing scale exists and is ascending", () => {
  const vals = [SP.xs, SP.sm, SP.md, SP.lg, SP.xl, SP.xxl];
  for (let i = 1; i < vals.length; i++) assert.ok(vals[i] > vals[i - 1]);
});

test("breakpoints: exactly four classes, three ascending boundaries", () => {
  assert.deepEqual(CLASSES, ["mobile", "tablet", "desktop", "large"]);
  assert.ok(BP.tablet < BP.desktop && BP.desktop < BP.large, "boundaries must ascend");
  assert.deepEqual(BP, { tablet: 768, desktop: 1024, large: 1440 });
});

test("classifyWidth maps every boundary to the right class", () => {
  assert.equal(classifyWidth(320), "mobile");
  assert.equal(classifyWidth(767), "mobile");
  assert.equal(classifyWidth(768), "tablet");
  assert.equal(classifyWidth(1023), "tablet");
  assert.equal(classifyWidth(1024), "desktop");
  assert.equal(classifyWidth(1439), "desktop");
  assert.equal(classifyWidth(1440), "large");
  assert.equal(classifyWidth(2560), "large");
});

test("media-query helpers reference only the canonical boundaries", () => {
  // below.* uses boundary-1 so ranges never overlap up.*
  assert.match(below.tablet, /767px/);
  assert.match(up.tablet, /768px/);
  assert.match(mq.phone, /@media .*767px/);
  assert.match(mq.desktop, /@media .*1024px/);
  // No stray legacy breakpoints leaked into the query strings.
  const allQueries = [...Object.values(below), ...Object.values(up), ...Object.values(mq)].join(" ");
  for (const legacy of ["480px", "600px", "700px", "760px", "880px"]) {
    assert.ok(!allQueries.includes(legacy), `legacy breakpoint ${legacy} must not appear`);
  }
});
