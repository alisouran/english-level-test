/* ═══════════════════════════════════════════
   LingoQuest — State Management
   ═══════════════════════════════════════════ */

export const state = {
  phase: "idle",           // idle | testing | essay | result
  theta: 0,
  level: 0,               // CEFR index 0-5
  prevLevel: 0,
  currentQ: null,
  currentIdx: 0,
  questionCount: 0,
  adminIds: new Set(),
  responses: [],          // {qId, correct, time, b}
  essays: [],             // [{prompt, text, skipped}]
  startTime: 0,
  perQTime: 0,
  lastQTime: 0,
  totalCorrect: 0,
  totalQuestions: 0,
  testStartTime: 0,
};

export function resetState() {
  state.phase = "idle";
  state.theta = 0;
  state.level = 0;
  state.prevLevel = 0;
  state.currentQ = null;
  state.currentIdx = 0;
  state.questionCount = 0;
  state.adminIds = new Set();
  state.responses = [];
  state.essays = [];
  state.startTime = 0;
  state.perQTime = 0;
  state.lastQTime = 0;
  state.totalCorrect = 0;
  state.totalQuestions = 0;
  state.testStartTime = 0;
}

export function recordResponse(qId, correct, b) {
  const now = Date.now();
  const timeTaken = state.lastQTime ? (now - state.lastQTime) / 1000 : 0;
  state.responses.push({qId, correct, time: timeTaken, b});
  if (correct) state.totalCorrect++;
  state.totalQuestions++;
  state.perQTime = state.perQTime
    ? (state.perQTime * (state.totalQuestions - 1) + timeTaken) / state.totalQuestions
    : timeTaken;
}

export function recordEssay(promptIdx, text, skipped) {
  state.essays[promptIdx] = {prompt: promptIdx, text, skipped};
}