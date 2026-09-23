/* ═══════════════════════════════════════════
   LingoQuest — IRT/EAP Adaptive Engine
   ═══════════════════════════════════════════

   This engine uses a 2PL IRT / EAP framework for
   adaptive item selection and provisional theta
   estimation.  The theta estimate is used only as
   an internal heuristic; the reported level is
   determined separately by computeReportedLevel()
   which requires direct evidence at each CEFR band.

   ═══ LIMITATIONS ═══════════════════════════════
   • Item difficulties are heuristic mappings from
     question id prefix (a1–c2), not empirically
     calibrated parameters.
   • The theta bounds used in levelFromTheta() are
     plausible defaults, not validated CEFR cut
     scores.
   • The test covers only grammar, vocabulary, and
     short reading multiple-choice items.  It cannot
     assess listening, speaking, or writing.
   • The optional essay is collected but not scored.
   • Reported levels require per-level exposure and
     accuracy thresholds defined as product rules,
     not psychometrically validated criteria.
   ═══════════════════════════════════════════ */

import { CEFR, ITEM_DIFFICULTY, getItemDifficulty } from "./questions.js";
import { state } from "./state.js";

const THETA_GRID = [];
for (let t = -3; t <= 3; t += 0.1) THETA_GRID.push(Math.round(t * 100) / 100);

const PRIOR = THETA_GRID.map(t => Math.exp(-(t * t) / 2));
const PRIOR_SUM = PRIOR.reduce((a, b) => a + b, 0);
PRIOR.forEach((v, i) => PRIOR[i] = v / PRIOR_SUM);

const MIN_QS = 10;
const MAX_QS = 40;
const THETA_SE = 0.45;
const INITIAL = 0; // A1 starting level index

/* ── Evidence thresholds (product rules, not validated cut scores) ── */
// Minimum attempts per level to consider it demonstrated
const MIN_ATTEMPTS_DEMONSTRATED = 2;
// Minimum attempts at C1 or C2 before those levels can be reported
const MIN_ADVANCED_EXPOSURE = 2;
// Minimum accuracy rate to consider a level demonstrated
const MIN_ACCURACY = 0.5;

// 2PL IRF
function pCorrect(theta, b) {
  const z = theta - b;
  return 1 / (1 + Math.exp(-1.7 * z));
}

// Fisher information
function fisherInfo(theta, b) {
  const p = pCorrect(theta, b);
  return p * (1 - p) * (1.7 * 1.7);
}

// EAP theta estimate
export function eapEstimate(responses) {
  if (!responses || responses.length === 0) return 0;
  let num = 0, den = 0;
  for (let g = 0; g < THETA_GRID.length; g++) {
    const theta = THETA_GRID[g];
    let L = PRIOR[g];
    for (const r of responses) {
      const p = pCorrect(theta, r.b);
      L *= r.correct ? p : (1 - p);
    }
    num += theta * L;
    den += L;
  }
  return den > 0 ? Math.round((num / den) * 100) / 100 : 0;
}

// Map theta to CEFR level index (internal heuristic only)
export function levelFromTheta(theta) {
  const bounds = [-1.8, -0.9, 0, 0.9, 1.8];
  for (let i = 0; i < bounds.length; i++) {
    if (theta < bounds[i]) return i;
  }
  return 5;
}

// Standard error of theta estimate
export function thetaSE(theta, responses) {
  let fi = 0;
  for (const r of responses) {
    fi += fisherInfo(theta, r.b);
  }
  return fi > 0 ? 1 / Math.sqrt(fi) : 99;
}

/* ── Evidence-based level determination ────────────
 *
 * Returns the highest CEFR level (0–5) supported by
 * actual per-level attempt and accuracy data, or -1
 * if evidence is inconclusive (no band meets both
 * exposure and accuracy criteria).
 *
 * Rules (operational thresholds, not validated cut scores):
 *   1. A level is "supported" if attempts >= MIN_ATTEMPTS_DEMONSTRATED
 *      AND correct/attempts >= MIN_ACCURACY.
 *   2. C1 (level 4) additionally requires >= MIN_ADVANCED_EXPOSURE
 *      items answered at C1.
 *   3. C2 (level 5) additionally requires >= MIN_ADVANCED_EXPOSURE
 *      items answered at C2, AND C1 must also be supported (attempts
 *      >= MIN_ATTEMPTS_DEMONSTRATED and accuracy >= MIN_ACCURACY).
 *   4. If no level meets these criteria, return -1 (inconclusive).
 *      Never infer a band from mere theta or from attempts alone
 *      when accuracy is below threshold.
 * ────────────────────────────────────────────────── */
export function isBandSupported(lvl) {
  const p = state.perLevel;
  const att = p.attempts[lvl];
  if (att < MIN_ATTEMPTS_DEMONSTRATED || p.correct[lvl] / att < MIN_ACCURACY) return false;
  if (lvl === 5 && !isBandSupported(4)) return false;
  return true;
}

export function computeReportedLevel() {
  const p = state.perLevel;
  const supported = isBandSupported;

  // Find the highest supported level (meets exposure AND accuracy)
  for (let lvl = 5; lvl >= 0; lvl--) {
    if (!supported(lvl)) continue;

    // C1 gate: cannot claim C1 without C1 items answered
    if (lvl >= 4 && p.attempts[4] < MIN_ADVANCED_EXPOSURE) {
      continue;
    }
    // C2 gate: requires C2 items answered AND qualifying C1 performance
    if (lvl >= 5) {
      if (p.attempts[5] < MIN_ADVANCED_EXPOSURE) continue;
      // C1 must also be performance-supported
      if (!supported(4)) continue;
    }
    return lvl;
  }

  // No band meets both exposure and accuracy criteria
  return -1;
}

/* ── Check if test should stop ───────────────────
 *
 * Stops when:
 *   • Hard cap (MAX_QS) reached.
 *   • Bank exhaustion (no unused items remain), even
 *     before the minimum count.
 *   • Below minimum (MIN_QS): never stop otherwise.
 *   • Candidate level needs probing but its pool is
 *     depleted: stop with limited-evidence reason.
 *   • Theta SE below threshold AND evidence exists at
 *     the candidate level (no outstanding probing).
 *
 *   Stop reasons never expose raw SE values as
 *   learner-facing precision claims.
 * ──────────────────────────────────────────────── */
export function shouldStop(QUESTIONS) {
  const n = state.totalQuestions;

  // Hard cap always stops
  if (n >= MAX_QS) {
    state.stopReason = "Maximum questions reached.";
    return true;
  }

  // Without an explicit bank, we cannot establish remaining evidence or safe stopping.
  if (!Array.isArray(QUESTIONS)) return false;

  // Bank exhaustion stops regardless of count
  if (QUESTIONS && Array.isArray(QUESTIONS)) {
    if (QUESTIONS.length === 0) {
      state.stopReason = "Question bank exhausted.";
      return true;
    }
    const remaining = QUESTIONS.filter(q => !state.adminIds.has(q.id));
    if (remaining.length === 0) {
      state.stopReason = "Question bank exhausted.";
      return true;
    }
  }

  // Below minimum: do not stop (except for cap/exhaustion above)
  if (n < MIN_QS) return false;

  // Candidate-level probing check
  const thetaLevel = levelFromTheta(state.theta);
  const hasEvidence = isBandSupported;
  if (thetaLevel === 5 && !hasEvidence(4)) {
    if (QUESTIONS.some(q => q.level === 4 && !state.adminIds.has(q.id))) return false;
    state.stopReason = "Limited evidence: no C1 questions remain for the C2 prerequisite.";
    return true;
  }
  if (!hasEvidence(thetaLevel)) {
    if (QUESTIONS.some(q => q.level === thetaLevel && !state.adminIds.has(q.id))) return false;
    state.stopReason = "Limited evidence: no unused questions remain at the candidate band.";
    return true;
  }

  // Only evidence-supported bands reach the internal stopping heuristic.

  // Standard SE-based stopping (internal heuristic, never presented as calibrated precision)
  const se = thetaSE(state.theta, state.responses);
  if (se < THETA_SE) {
    state.stopReason = "Sufficient responses collected.";
    return true;
  }

  return false;
}

/* ── Pick next question (adaptive) ───────────────
 *
 * Selection strategy:
 *   • First question: random A1–A2 item.
 *   • Subsequent: items within ±1 level of current
 *     theta-based estimate, but expand upper bound
 *     to include C1/C2 items when theta suggests
 *     advanced proficiency and exposure is insufficient.
 *   • Fall through to any unused item if the band is
 *     empty.
 *   • Return null if all items are used (bank exhausted).
 * ────────────────────────────────────────────── */
export function pickQuestion(QUESTIONS) {
  const used = state.adminIds;
  const theta = state.theta;

  // Empty bank guard
  if (!QUESTIONS || !Array.isArray(QUESTIONS) || QUESTIONS.length === 0) {
    return null;
  }

  // First question: pick from A1–A2 difficulty
  if (used.size === 0) {
    const candidates = QUESTIONS.filter(q => Math.abs(getItemDifficulty(q.id) - ITEM_DIFFICULTY[INITIAL]) < 0.5);
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return QUESTIONS[0];
  }

  // Theta-based level for selection heuristics; state.level may lag behind theta.
  const thetaLevel = levelFromTheta(state.theta);
  const candidateLevel = thetaLevel;
  let probeLevel = -1; // -1 means no probing needed

  if (!isBandSupported(candidateLevel)) probeLevel = candidateLevel;

  // For C2 candidate, check if C1 evidence is missing — probe C1 first
  if (candidateLevel >= 5) {
    const c1Attempts = state.perLevel.attempts[4];
    const c1AccuracyOK = c1Attempts >= MIN_ATTEMPTS_DEMONSTRATED &&
      state.perLevel.correct[4] / c1Attempts >= MIN_ACCURACY;
    if (!c1AccuracyOK) {
      const c1Remaining = QUESTIONS.filter(q => q.level === 4 && !used.has(q.id));
      if (c1Remaining.length > 0) probeLevel = 4;
    }
  }

  let minD = ITEM_DIFFICULTY[Math.max(0, thetaLevel - 1)];
  let maxD = ITEM_DIFFICULTY[Math.min(5, thetaLevel + 1)];

  // Probe the specific unmet level before sampling neighboring bands.
  if (probeLevel >= 0) {
    const probes = QUESTIONS.filter(q => q.level === probeLevel && !used.has(q.id));
    if (probes.length) return probes[0];
  }

  // Candidates within difficulty range, not used
  let candidates = QUESTIONS.filter(q => {
    const d = getItemDifficulty(q.id);
    return d >= minD && d <= maxD && !used.has(q.id);
  });

  // Give preference to probe level items
  if (probeLevel >= 0) {
    const filtered = candidates.filter(q => {
      const lvl = q.level !== undefined ? q.level : 0;
      return lvl === probeLevel;
    });
    if (filtered.length > 0) {
      candidates = filtered;
    }
  }

  if (candidates.length === 0) {
    // Fallback: any unused question
    candidates = QUESTIONS.filter(q => !used.has(q.id));
  }

  if (candidates.length === 0) return null;

  // Pick by maximum Fisher information at current theta
  let best = null;
  let bestFi = -1;
  for (const q of candidates) {
    const d = getItemDifficulty(q.id);
    const fi = fisherInfo(theta, d);
    if (fi > bestFi) {
      bestFi = fi;
      best = q;
    }
  }

  // Add small random noise to avoid always picking same diff
  if (candidates.length > 1) {
    const tie = candidates.filter(q => {
      const d = getItemDifficulty(q.id);
      return Math.abs(fisherInfo(theta, d) - bestFi) < 0.01;
    });
    if (tie.length > 1) best = tie[Math.floor(Math.random() * tie.length)];
  }

  return best || candidates[0];
}

/* ── Build result data object (DOM-independent) ──
 *
 * Returns a plain object with the result data suitable
 * for JSON export.  This function has no DOM dependency
 * and can be tested in Node.js.
 * ────────────────────────────────────────────────── */
export function buildResultData() {
  const p = state.perLevel;
  const reported = computeReportedLevel();
  const reportedLabel = reported >= 0 ? ["A1","A2","B1","B2","C1","C2"][reported] : "Inconclusive";
  const total = state.totalQuestions;
  const correct = state.totalCorrect;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const avgTime = state.responses.length > 0
    ? (state.responses.reduce((s, r) => s + (r.time || 0), 0) / state.responses.length).toFixed(1)
    : "0.0";

  const data = {
    test: "LingoQuest Adaptive English Level Test",
    evidence_based_level: reportedLabel,
    theta_estimate: state.theta,
    stop_reason: state.stopReason || "Test completed.",
    stats: {
      questions_answered: total,
      correct: correct,
      accuracy: accuracy + "%",
      avg_time_per_question: avgTime + "s",
    },
    per_level_performance: ["A1","A2","B1","B2","C1","C2"].map((lvl, i) => ({
      level: lvl,
      attempted: p.attempts[i],
      correct: p.correct[i],
      accuracy: p.attempts[i] > 0
        ? Math.round((p.correct[i] / p.attempts[i]) * 100) + "%"
        : "—",
      demonstrated: isBandSupported(i),
    })),
    responses: state.responses.map(r => ({
      question_id: r.qId,
      question_text: r.questionText || "",
      options: r.options || [],
      selected_answer: r.selectedAnswer !== undefined ? r.selectedAnswer : -1,
      correct: r.correct,
      difficulty: getItemDifficulty(r.qId),
      time_taken: (r.time || 0).toFixed(1) + "s",
    })),
    essays: state.essays.filter(e => e && !e.skipped).map(e => ({
      prompt_index: e.prompt + 1,
      text: e.text,
    })),
    limitations: {
      statement: "This result is based on a limited set of grammar, vocabulary, and reading "
        + "multiple-choice questions. It represents performance on this specific question bank only "
        + "and is not a certified CEFR assessment.",
      not_assessed: [
        "Listening comprehension",
        "Speaking ability (pronunciation, fluency, interaction)",
        "Writing proficiency (the optional essay is collected but not scored)",
        "Real-world communicative competence",
      ],
      item_difficulty_note: "Item difficulties are heuristic mappings from question id prefix (a1–c2), "
        + "not empirically calibrated parameters. Theta thresholds are plausible defaults, "
        + "not validated CEFR cut scores.",
      evidence_rule_note: "A reported band requires at least 2 attempts and 50% accuracy at that band. "
        + "C2 also requires qualifying C1 performance. C1/C2 require items answered "
        + "at those levels with sufficient accuracy.",
    },
  };

  return data;
}