/* ═══════════════════════════════════════════
   LingoQuest — Software Validation Tests
   ═══════════════════════════════════════════
   These are software checks for correctness of
   selection, stopping, reporting, and result
   logic.  They do NOT constitute psychometric
   validation of item parameters, CEFR cut
   scores, or assessment accuracy.

   All tests import production modules from
   ../js/engine.js and ../js/state.js.

   Usage:  node --test tests/*.test.mjs
   ═══════════════════════════════════════════ */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert";

import {
  eapEstimate, levelFromTheta, thetaSE,
  computeReportedLevel, shouldStop, pickQuestion,
  buildResultData,
} from "../js/engine.js";
import { state, resetState, recordResponse } from "../js/state.js";
import { QUESTIONS } from "../questions.js";
import { renderPromptJSON } from "../js/ui.js";

// ── Test helpers ──────────────────────────

/** Build a deterministic question bank for tests. */
function makeQuestions(counts) {
  const levels = ["a1","a2","b1","b2","c1","c2"];
  const qs = [];
  for (let li = 0; li < levels.length; li++) {
    const prefix = levels[li];
    const n = (counts[prefix] || 0);
    for (let i = 0; i < n; i++) {
      qs.push({ id: prefix + "-" + i, level: li, opts: ["a","b","c","d"], a: 0 });
    }
  }
  return qs;
}

/** Answer items via recordResponse and record administered IDs. */
function answerItems(levelAnswers) {
  // levelAnswers = [{level: 0-5, correct: bool}, ...]
  for (const a of levelAnswers) {
    const lvl = a.level;
    const correct = a.correct;
    const id = ["a1","a2","b1","b2","c1","c2"][lvl] + "-test-" + state.responses.length;
    state.adminIds.add(id);
    recordResponse(id, correct, [-2,-1,0,1,2,3][lvl], "", ["a","b","c","d"], correct ? 0 : 1, lvl);
  }
}

// ═══════════════════════════════════════════════
// 1. computeReportedLevel — no fallback promotion
// ═══════════════════════════════════════════════
describe("computeReportedLevel", () => {
  afterEach(() => resetState());

  it("returns -1 (inconclusive) with no data", () => {
    assert.strictEqual(computeReportedLevel(), -1);
  });

  it("returns -1 when all answers are wrong", () => {
    answerItems([
      { level: 1, correct: false },
      { level: 1, correct: false },
      { level: 1, correct: false },
    ]);
    assert.strictEqual(computeReportedLevel(), -1);
  });

  it("returns -1 when accuracy is below 50%", () => {
    answerItems([
      { level: 0, correct: true },
      { level: 0, correct: false },
      { level: 0, correct: false },
    ]);
    assert.strictEqual(computeReportedLevel(), -1);
  });

  it("returns A1 when all A1 correct and no higher levels attempted", () => {
    answerItems([
      { level: 0, correct: true },
      { level: 0, correct: true },
    ]);
    assert.strictEqual(computeReportedLevel(), 0);
  });

  it("reports B2 at most when C1 not attempted (11-item B1/B2 scenario)", () => {
    answerItems([
      { level: 1, correct: true }, { level: 1, correct: true },
      { level: 2, correct: true }, { level: 2, correct: true },
      { level: 2, correct: true }, { level: 2, correct: true },
      { level: 2, correct: true }, { level: 2, correct: true },
      { level: 3, correct: true }, { level: 3, correct: true },
      { level: 3, correct: true }, { level: 3, correct: true },
    ]);
    assert.strictEqual(computeReportedLevel(), 3);
  });

  it("reports C1 only when C1 items attempted with sufficient accuracy", () => {
    answerItems([
      { level: 3, correct: true }, { level: 3, correct: true },
      { level: 4, correct: true }, { level: 4, correct: true },
    ]);
    assert.strictEqual(computeReportedLevel(), 4);
  });

  it("reports C2 only when C1 AND C2 have sufficient evidence", () => {
    answerItems([
      { level: 4, correct: true }, { level: 4, correct: true },
      { level: 5, correct: true }, { level: 5, correct: true },
    ]);
    assert.strictEqual(computeReportedLevel(), 5);
  });

  it("does not report C1 when C1 answers are all wrong", () => {
    answerItems([
      { level: 3, correct: true }, { level: 3, correct: true },
      { level: 4, correct: false }, { level: 4, correct: false },
    ]);
    assert.strictEqual(computeReportedLevel(), 3);
  });

  it("does not report C2 when C2 answers are all wrong", () => {
    answerItems([
      { level: 4, correct: true }, { level: 4, correct: true },
      { level: 5, correct: false }, { level: 5, correct: false },
    ]);
    assert.strictEqual(computeReportedLevel(), 4);
  });

  it("does not report C2 when C1 answers are wrong (C1 accuracy fails)", () => {
    answerItems([
      { level: 4, correct: false }, { level: 4, correct: false },
      { level: 5, correct: true }, { level: 5, correct: true },
    ]);
    // C1: 0/2 = 0% < 50% → not supported
    // C2: 2/2 = 100% but C1 not supported → cannot get C2
    assert.strictEqual(computeReportedLevel(), -1);
  });

  it("handles mixed accuracy: below 50% level not supported", () => {
    answerItems([
      { level: 0, correct: true }, { level: 0, correct: true },
      { level: 1, correct: true }, { level: 1, correct: false },
      { level: 1, correct: false },
    ]);
    // A1: 2/2 = 100% supported; A2: 1/3 = 33% not supported
    assert.strictEqual(computeReportedLevel(), 0);
  });

  it("handles empty test state after reset", () => {
    resetState();
    assert.strictEqual(computeReportedLevel(), -1);
  });

  it("restart (reset then new answers) produces fresh results", () => {
    answerItems([{ level: 3, correct: true }, { level: 3, correct: true }]);
    assert.strictEqual(computeReportedLevel(), 3);
    resetState();
    assert.strictEqual(computeReportedLevel(), -1);
    answerItems([{ level: 0, correct: true }, { level: 0, correct: true }]);
    assert.strictEqual(computeReportedLevel(), 0);
  });
});

// ═══════════════════════════════════════════════
// 2. levelFromTheta — boundary tests
// ═══════════════════════════════════════════════
describe("levelFromTheta", () => {
  it("returns A1 (0) for theta below -1.8", () => {
    assert.strictEqual(levelFromTheta(-2.0), 0);
  });
  it("returns A2 (1) for theta between -1.8 and -0.9", () => {
    assert.strictEqual(levelFromTheta(-1.5), 1);
  });
  it("returns B1 (2) for theta between -0.9 and 0", () => {
    assert.strictEqual(levelFromTheta(-0.5), 2);
  });
  it("returns B2 (3) for theta between 0 and 0.9", () => {
    assert.strictEqual(levelFromTheta(0.4), 3);
  });
  it("returns C1 (4) for theta between 0.9 and 1.8", () => {
    assert.strictEqual(levelFromTheta(1.2), 4);
  });
  it("returns C2 (5) for theta above 1.8", () => {
    assert.strictEqual(levelFromTheta(2.0), 5);
  });
  it("returns B2 for theta exactly 0", () => {
    assert.strictEqual(levelFromTheta(0.0), 3);
  });
});

// ═══════════════════════════════════════════════
// 3. shouldStop — cap, exhaustion, candidate-pool, evidence
// ═══════════════════════════════════════════════
describe("shouldStop", () => {
  afterEach(() => resetState());

  it("does not stop before minimum questions (with remaining bank)", () => {
    const qs = makeQuestions({ a1: 5, a2: 5 });
    answerItems([{ level: 0, correct: true }, { level: 0, correct: true }]);
    assert.strictEqual(shouldStop(qs), false);
  });

  it("stops at hard cap (MAX_QS = 40)", () => {
    const qs = makeQuestions({ a1: 50 });
    for (let i = 0; i < 40; i++) {
      const id = "a1-" + i;
      state.adminIds.add(id);
      recordResponse(id, true, -2.0, "", ["a"], 0, 0);
    }
    state.stopReason = "";
    assert.strictEqual(shouldStop(qs), true);
    assert.ok(state.stopReason.includes("Maximum"));
  });

  it("never treats missing bank evidence as an early-stop pass", () => {
    const many = Array.from({length: 20}, () => ({level: 2, correct: true}));
    answerItems(many);
    state.theta = 0.4; // B2 candidate is unsupported despite many high-information responses
    assert.ok(thetaSE(state.theta, state.responses) < 0.45);
    assert.strictEqual(shouldStop(undefined), false);
    assert.strictEqual(shouldStop(makeQuestions({b2: 3, a2: 3})), false);
  });

  it("stops on empty bank array", () => {
    assert.strictEqual(shouldStop([]), true);
    assert.ok(state.stopReason.includes("exhaust"));
  });

  it("stops on depleted bank (all questions used, none left)", () => {
    const qs = makeQuestions({ a1: 1 });
    state.adminIds.add("a1-0");
    recordResponse("a1-0", true, -2.0, "", ["a"], 0, 0);
    assert.strictEqual(shouldStop(qs), true);
    assert.ok(state.stopReason.includes("exhaust"));
  });

  it("does not stop when C1 probing needed and C1 items remain", () => {
    const qs = makeQuestions({ a1: 2, b1: 3, b2: 3, c1: 5 });
    answerItems([
      { level: 0, correct: true }, { level: 0, correct: true },
      { level: 2, correct: true }, { level: 2, correct: true },
      { level: 2, correct: true }, { level: 2, correct: true },
      { level: 3, correct: true }, { level: 3, correct: true },
      { level: 3, correct: true }, { level: 3, correct: true },
    ]);
    state.theta = 1.5;       // theta → C1
    state.level = 4;          // C1 from levelFromTheta(1.5)
    assert.strictEqual(shouldStop(qs), false);
  });

  it("explains the depleted C1 prerequisite rather than mislabeling the C2 pool", () => {
    const qs = makeQuestions({c1: 1, c2: 4, b2: 8});
    answerItems(Array.from({length: 10}, (_, i) => ({level: 3, correct: i < 8})));
    state.theta = 2.2;
    state.adminIds.add("c1-0");
    recordResponse("c1-0", false, 2.0, "", ["a"], 1, 4);
    assert.strictEqual(shouldStop(qs), true);
    assert.match(state.stopReason, /C1 questions.*C2 prerequisite/i);
  });

  it("stops with limited-evidence reason when C1 items depleted and C1 needed", () => {
    const qs = makeQuestions({ a1: 2, b1: 2, b2: 2, c1: 1 });
    answerItems([
      { level: 0, correct: true }, { level: 0, correct: true },
      { level: 2, correct: true }, { level: 2, correct: true },
      { level: 2, correct: true }, { level: 2, correct: true },
      { level: 3, correct: true }, { level: 3, correct: true },
      { level: 3, correct: true }, { level: 3, correct: true },
    ]);
    state.theta = 1.5;
    state.level = 4;
    // Administer the sole C1 item through the production response path.
    state.adminIds.add("c1-0");
    recordResponse("c1-0", false, 2.0, "", ["a"], 1, 4);
    const result = shouldStop(qs);
    assert.strictEqual(result, true);
    assert.match(state.stopReason, /limited evidence/i);
  });
});

// ═══════════════════════════════════════════════
// 4. pickQuestion — empty bank, no repeats, C1/C2 probing
// ═══════════════════════════════════════════════
describe("pickQuestion", () => {
  afterEach(() => resetState());

  it("returns null for empty bank array", () => {
    assert.strictEqual(pickQuestion([]), null);
  });

  it("returns null for null/undefined bank", () => {
    assert.strictEqual(pickQuestion(null), null);
    assert.strictEqual(pickQuestion(undefined), null);
  });

  it("returns a question from the bank", () => {
    const qs = makeQuestions({ a1: 3 });
    assert.ok(pickQuestion(qs));
  });

  it("does not return already-administered questions", () => {
    const qs = makeQuestions({ a1: 3 });
    const first = pickQuestion(qs);
    assert.ok(first);
    state.adminIds.add(first.id);
    state.totalQuestions++;
    const second = pickQuestion(qs);
    assert.ok(second);
    assert.notStrictEqual(second.id, first.id);
  });

  it("returns null when all questions used", () => {
    const qs = makeQuestions({ a1: 1 });
    const first = pickQuestion(qs);
    assert.ok(first);
    state.adminIds.add(first.id);
    state.totalQuestions++;
    assert.strictEqual(pickQuestion(qs), null);
  });

  it("probes an unmet lower candidate band before early stopping", () => {
    const qs = makeQuestions({ a1: 4, a2: 4, b1: 4 });
    answerItems([{ level: 0, correct: true }, { level: 0, correct: true }]);
    state.theta = -0.5; // B1 candidate with no B1 evidence
    assert.strictEqual(pickQuestion(qs).level, 2);
  });

  it("selects C1 items when theta suggests C1 and C1 exposure insufficient", () => {
    const qs = makeQuestions({ a1: 2, b1: 3, b2: 3, c1: 5 });
    // Simulate state as if app.js reached C1 theta
    answerItems([
      { level: 0, correct: true }, { level: 0, correct: true },
      { level: 2, correct: true }, { level: 2, correct: true },
      { level: 2, correct: true }, { level: 2, correct: true },
      { level: 3, correct: true }, { level: 3, correct: true },
      { level: 3, correct: true }, { level: 3, correct: true },
    ]);
    state.theta = 1.5;
    state.level = levelFromTheta(state.theta); // 4 = C1
    const q = pickQuestion(qs);
    assert.ok(q);
    assert.strictEqual(q.level, 4);
  });

  it("selects C1 items for C2 candidate when C1 evidence missing", () => {
    const qs = makeQuestions({ a1: 2, b1: 2, b2: 2, c1: 5, c2: 5 });
    answerItems([
      { level: 0, correct: true }, { level: 0, correct: true },
      { level: 2, correct: true }, { level: 2, correct: true },
      { level: 2, correct: true }, { level: 2, correct: true },
      { level: 3, correct: true }, { level: 3, correct: true },
      { level: 3, correct: true }, { level: 3, correct: true },
    ]);
    state.theta = 2.0;       // theta → C2
    state.level = levelFromTheta(state.theta); // 5 = C2
    // C1 has 0 attempts, C2 has 0 attempts → probe C1 first
    const q = pickQuestion(qs);
    assert.ok(q);
    assert.strictEqual(q.level, 4);
  });

  it("does not select C2 items when only C1 is the candidate level", () => {
    const qs = makeQuestions({ a1: 2, b1: 2, b2: 2, c1: 5, c2: 5 });
    answerItems([
      { level: 0, correct: true }, { level: 0, correct: true },
      { level: 2, correct: true }, { level: 2, correct: true },
      { level: 2, correct: true }, { level: 2, correct: true },
      { level: 3, correct: true }, { level: 3, correct: true },
      { level: 3, correct: true }, { level: 3, correct: true },
    ]);
    state.theta = 1.5;       // theta → C1
    state.level = levelFromTheta(state.theta); // 4 = C1
    // C1 has 0 attempts, need 2 → probe C1
    const q = pickQuestion(qs);
    assert.ok(q);
    assert.strictEqual(q.level, 4);
  });
});

// ═══════════════════════════════════════════════
// 5. buildResultData & UI export — single production source
// ═══════════════════════════════════════════════
describe("buildResultData", () => {
  afterEach(() => resetState());

  it("returns expected top-level keys", () => {
    answerItems([{ level: 0, correct: true }, { level: 0, correct: true }]);
    state.reportedLevel = computeReportedLevel();
    state.stopReason = "Test completed.";
    const data = buildResultData();
    assert.ok(data.test);
    assert.ok(data.evidence_based_level);
    assert.ok(data.stop_reason);
    assert.ok(data.stats);
    assert.ok(data.per_level_performance);
    assert.ok(data.responses);
    assert.ok(data.essays);
    assert.ok(data.limitations);
  });

  it("reports Inconclusive when no level supported", () => {
    answerItems([{ level: 0, correct: false }, { level: 0, correct: false }]);
    state.reportedLevel = computeReportedLevel();
    assert.strictEqual(buildResultData().evidence_based_level, "Inconclusive");
  });

  it("reports correct evidence-based level after computeReportedLevel", () => {
    answerItems([
      { level: 0, correct: true }, { level: 0, correct: true },
      { level: 1, correct: true }, { level: 1, correct: true },
    ]);
    state.reportedLevel = computeReportedLevel();
    assert.strictEqual(buildResultData().evidence_based_level, "A2");
  });

  it("includes per-level performance data", () => {
    answerItems([{ level: 0, correct: true }, { level: 0, correct: false }]);
    state.reportedLevel = computeReportedLevel();
    const data = buildResultData();
    assert.strictEqual(data.per_level_performance.length, 6);
    const a1 = data.per_level_performance[0];
    assert.strictEqual(a1.level, "A1");
    assert.strictEqual(a1.attempted, 2);
    assert.strictEqual(a1.correct, 1);
    assert.strictEqual(a1.demonstrated, true); // 1/2 >= 0.5, 2 >= 2
  });

  it("includes limitations section with not_assessed array", () => {
    answerItems([{ level: 0, correct: true }, { level: 0, correct: true }]);
    state.reportedLevel = computeReportedLevel();
    const lim = buildResultData().limitations;
    assert.ok(lim.statement);
    assert.ok(Array.isArray(lim.not_assessed));
    assert.ok(lim.not_assessed.length >= 3);
    assert.ok(lim.item_difficulty_note);
    assert.ok(lim.evidence_rule_note);
    // Verify "at or below" wording is removed
    assert.ok(!lim.evidence_rule_note.includes("at or below"));
  });

  it("includes responses with detailed fields", () => {
    answerItems([{ level: 0, correct: true }, { level: 0, correct: false }]);
    state.reportedLevel = computeReportedLevel();
    const data = buildResultData();
    assert.strictEqual(data.responses.length, 2);
    assert.strictEqual(data.responses[0].correct, true);
    assert.strictEqual(data.responses[1].correct, false);
    assert.ok("question_text" in data.responses[0]);
    assert.ok("options" in data.responses[0]);
    assert.ok("selected_answer" in data.responses[0]);
    assert.ok("time_taken" in data.responses[0]);
  });

  it("real UI export consumes the same production result builder", () => {
    answerItems([{ level: 0, correct: true }, { level: 0, correct: true }]);
    state.reportedLevel = -1; // stale UI state must not change the actual export
    const output = { textContent: "" };
    const oldDocument = globalThis.document;
    globalThis.document = { getElementById: id => id === "promptOutput" ? output : null };
    try {
      renderPromptJSON();
      assert.deepStrictEqual(JSON.parse(output.textContent), buildResultData());
      assert.strictEqual(JSON.parse(output.textContent).evidence_based_level, "A1");
    } finally {
      globalThis.document = oldDocument;
    }
  });

  it("includes stats.avg_time_per_question", () => {
    answerItems([{ level: 0, correct: true }, { level: 0, correct: true }]);
    state.reportedLevel = computeReportedLevel();
    const stats = buildResultData().stats;
    assert.ok(stats.avg_time_per_question);
  });
});

// ═══════════════════════════════════════════════
// 6. resetState — full reset verification
// ═══════════════════════════════════════════════
describe("resetState", () => {
  it("resets all fields to initial values", () => {
    state.theta = 3.0;
    state.level = 5;
    state.reportedLevel = 4;
    state.totalQuestions = 10;
    state.totalCorrect = 8;
    state.perLevel.attempts[3] = 5;
    state.perLevel.correct[3] = 4;
    state.stopReason = "Some reason";
    state.responses.push({qId: "test"});
    state.adminIds.add("test-1");

    resetState();

    assert.strictEqual(state.theta, 0);
    assert.strictEqual(state.level, 0);
    assert.strictEqual(state.reportedLevel, -1);
    assert.strictEqual(state.totalQuestions, 0);
    assert.strictEqual(state.totalCorrect, 0);
    assert.strictEqual(state.stopReason, "");
    assert.strictEqual(state.responses.length, 0);
    assert.strictEqual(state.adminIds.size, 0);
    assert.deepStrictEqual(state.perLevel.attempts, [0,0,0,0,0,0]);
    assert.deepStrictEqual(state.perLevel.correct, [0,0,0,0,0,0]);
  });

  it("enables fresh answers after restart", () => {
    answerItems([{ level: 0, correct: true }, { level: 0, correct: true }]);
    assert.strictEqual(state.totalQuestions, 2);
    resetState();
    assert.strictEqual(state.totalQuestions, 0);
    answerItems([{ level: 1, correct: true }]);
    assert.strictEqual(state.totalQuestions, 1);
  });
});

// ═══════════════════════════════════════════════
// 7. eapEstimate — basic sanity
// ═══════════════════════════════════════════════
describe("eapEstimate", () => {
  it("returns 0 for empty responses", () => {
    assert.strictEqual(eapEstimate([]), 0);
    assert.strictEqual(eapEstimate(null), 0);
    assert.strictEqual(eapEstimate(undefined), 0);
  });
  it("returns positive theta for correct easy items", () => {
    const resp = [
      { correct: true, b: -2.0 },
      { correct: true, b: -2.0 },
      { correct: true, b: -1.0 },
    ];
    assert.ok(eapEstimate(resp) > 0);
  });
  it("returns negative theta for incorrect easy items", () => {
    const resp = [
      { correct: false, b: -2.0 },
      { correct: false, b: -2.0 },
      { correct: false, b: -1.0 },
    ];
    assert.ok(eapEstimate(resp) < 0);
  });
});

// ═══════════════════════════════════════════════
// 8. thetaSE — basic sanity
// ═══════════════════════════════════════════════
describe("thetaSE", () => {
  it("returns large value for few responses", () => {
    assert.ok(thetaSE(0, [{ correct: true, b: 0 }]) > 0.5);
  });
  it("returns smaller value for many responses", () => {
    const manyResp = [];
    for (let i = 0; i < 30; i++) {
      manyResp.push({ correct: true, b: i % 6 - 2 });
    }
    assert.ok(thetaSE(0, manyResp) < 0.5);
  });
});

// ═══════════════════════════════════════════════
// 9. Questions bank — fix assertions for corrected items
// ═══════════════════════════════════════════════
describe("questions bank fixes", () => {
  it("b2-21 has unambiguously plural subject", () => {
    const q = QUESTIONS.find(item => item.id === "b2-21");
    assert.match(q.q, /individual data points.*last year/i);
    assert.strictEqual(q.opts[q.a], "were");
  });

  it("c1-4 has grammatical conditional with time context", () => {
    const q = QUESTIONS.find(item => item.id === "c1-4");
    assert.match(q.q, /last term/);
    assert.strictEqual(q.opts[q.a], "would have closed");
  });

  it("c2-1 has past time reference", () => {
    const q = QUESTIONS.find(item => item.id === "c2-1");
    assert.match(q.q, /last year.*by the end of that day/);
    assert.strictEqual(q.opts[q.a], "would have become");
  });

  it("b2-26 has no defensible skill distractor", () => {
    const q = QUESTIONS.find(item => item.id === "b2-26");
    assert.match(q.q, /natural/);
    assert.strictEqual(q.opts[q.a], "talent");
    assert.ok(!q.opts.includes("skill") && !q.opts.includes("gift"));
  });
});