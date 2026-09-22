/* ═══════════════════════════════════════════
   LingoQuest — IRT/EAP Adaptive Engine
   ═══════════════════════════════════════════ */

import { CEFR, ITEM_DIFFICULTY, getItemDifficulty } from "./questions.js";
import { state } from "./state.js";

const THETA_GRID = [];
for (let t = -3; t <= 3; t += 0.1) THETA_GRID.push(Math.round(t * 100) / 100);

const PRIOR = THETA_GRID.map(t => Math.exp(-(t * t) / 2));
const PRIOR_SUM = PRIOR.reduce((a, b) => a + b, 0);
PRIOR.forEach((v, i) => PRIOR[i] = v / PRIOR_SUM);

const MIN_QS = 8;
const MAX_QS = 40;
const THETA_SE = 0.4;
const INITIAL = 0; // A2 starting level index

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

// Map theta to CEFR level index
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

// Check if test should stop
export function shouldStop() {
  const n = state.totalQuestions;
  if (n < MIN_QS) return false;
  if (n >= MAX_QS) return true;
  const se = thetaSE(state.theta, state.responses);
  if (se < THETA_SE) return true;
  return false;
}

// Pick next question adaptively (QUESTIONS passed as arg to avoid circular imports)
export function pickQuestion(QUESTIONS) {
  const used = state.adminIds;
  const theta = state.theta;

  // First question: pick from middle difficulty
  if (used.size === 0) {
    const candidates = QUESTIONS.filter(q => Math.abs(getItemDifficulty(q.id) - ITEM_DIFFICULTY[INITIAL]) < 0.5);
    return candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : QUESTIONS[0];
  }

  // Proven level range
  const provenLevel = state.level;
  const minD = ITEM_DIFFICULTY[Math.max(0, provenLevel - 1)];
  const maxD = ITEM_DIFFICULTY[Math.min(5, provenLevel + 1)];

  // Candidates within proven level range, not used
  let candidates = QUESTIONS.filter(q => {
    const d = getItemDifficulty(q.id);
    return d >= minD && d <= maxD && !used.has(q.id);
  });

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