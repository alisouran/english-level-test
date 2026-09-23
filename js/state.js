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
  userId: "",             // set from db.js getUserId()
  adminIds: new Set(),
  seenQuestionIds: new Set(),  // persisted across sessions via db.js
  resultId: "",           // UUID set when saving a result
  responses: [],          // {qId, correct, time, b, id, questionText, options, selectedAnswer}
  essays: [],             // [{prompt, text, skipped}]
  startTime: 0,
  perQTime: 0,
  lastQTime: 0,
  totalCorrect: 0,
  totalQuestions: 0,
  testStartTime: 0,
  duration: 0,            // total test duration in milliseconds
  reportedLevel: -1,
  perLevel: { attempts: [0,0,0,0,0,0], correct: [0,0,0,0,0,0] },
  stopReason: "",
};

export function resetState() {
  state.phase = "idle";
  state.theta = 0;
  state.level = 0;
  state.prevLevel = 0;
  state.currentQ = null;
  state.currentIdx = 0;
  state.adminIds = new Set();
  state.resultId = "";
  state.responses = [];
  state.essays = [];
  state.startTime = 0;
  state.perQTime = 0;
  state.lastQTime = 0;
  state.totalCorrect = 0;
  state.totalQuestions = 0;
  state.testStartTime = 0;
  state.duration = 0;
  state.reportedLevel = -1;
  state.perLevel = { attempts: [0,0,0,0,0,0], correct: [0,0,0,0,0,0] };
  state.stopReason = "";
  // userId and seenQuestionIds are deliberately preserved across test sessions
}

export function recordResponse(qId, correct, b, questionText, options, selectedAnswer, questionLevel) {
  const now = Date.now();
  const timeTaken = state.lastQTime ? (now - state.lastQTime) / 1000 : 0;
  state.responses.push({qId, id: qId, correct, time: timeTaken, b, questionText, options, selectedAnswer});
  const level = Number.isInteger(questionLevel) && questionLevel >= 0 && questionLevel <= 5
    ? questionLevel : ["a1","a2","b1","b2","c1","c2"].indexOf((qId || "").split("-")[0]);
  if (level >= 0) {
    state.perLevel.attempts[level]++;
    if (correct) state.perLevel.correct[level]++;
  }
  if (correct) state.totalCorrect++;
  state.totalQuestions++;
  state.perQTime = state.perQTime
    ? (state.perQTime * (state.totalQuestions - 1) + timeTaken) / state.totalQuestions
    : timeTaken;
}

export function recordEssay(promptIdx, text, skipped) {
  state.essays[promptIdx] = {prompt: promptIdx, text, skipped};
}