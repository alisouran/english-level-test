/* ═══════════════════════════════════════════
   LingoQuest — Entry Point & Event Wiring
   ═══════════════════════════════════════════ */

import { QUESTIONS } from "./questions.js";
import { state, resetState, recordResponse, recordEssay } from "./state.js";
import { eapEstimate, levelFromTheta, pickQuestion, shouldStop } from "./engine.js";
import {
  showScreen, updateTopBar, renderQuestion, showAnswerFeedback,
  renderEssay, renderResult, showToast, getEssayPrompts
} from "./ui.js";

/* ── Start test ────────────────────────── */
function startTest() {
  resetState();
  state.phase = "testing";
  state.testStartTime = Date.now();
  state.prevLevel = 2;
  state.level = 2;

  loadNextQuestion();
  showScreen("screen-question");
  updateTopBar();
}

/* ── Load next question (adaptive) ─────── */
function loadNextQuestion() {
  const q = pickQuestion(QUESTIONS);
  if (!q) {
    finishTest();
    return;
  }
  state.currentQ = q;
  state.currentIdx = state.totalQuestions;
  state.adminIds.add(q.id);
  state.lastQTime = Date.now();

  renderQuestion(q, state.totalQuestions + 1, state.totalQuestions + 1);
  bindOptionListeners();
}

/* ── Bind option listeners ─────────────── */
function bindOptionListeners() {
  document.querySelectorAll("#qOptions .option").forEach(btn => {
    btn.addEventListener("click", onOptionClick);
  });
}

/* ── Option click handler ──────────────── */
function onOptionClick(e) {
  const btn = e.currentTarget;
  const idx = parseInt(btn.dataset.index, 10);
  const q = state.currentQ;
  if (!q) return;

  const correct = idx === q.a;
  const b = q.level !== undefined
    ? [-2.0, -1.0, 0.0, 1.0, 2.0, 3.0][Math.min(5, q.level)]
    : 0;

  recordResponse(q.id, correct, b);
  showAnswerFeedback(idx, q.a);

  state.theta = eapEstimate(state.responses);
  state.prevLevel = state.level;
  state.level = levelFromTheta(state.theta);
  updateTopBar();

  setTimeout(() => {
    if (shouldStop()) {
      finishTest();
    } else {
      loadNextQuestion();
    }
  }, 600);
}

/* ── Finish test ────────────────────────── */
function finishTest() {
  state.phase = "essay";
  state.prevLevel = state.level;
  state.level = levelFromTheta(state.theta);

  renderEssay(0);
  showScreen("screen-essay");
  bindEssayListeners();
  updateTopBar();
}

/* ── Bind essay listeners ──────────────── */
function bindEssayListeners() {
  const saveBtn = document.getElementById("btnSaveEssay");
  const skipBtn = document.getElementById("btnSkipEssay");
  if (saveBtn) saveBtn.addEventListener("click", onSaveEssay);
  if (skipBtn) skipBtn.addEventListener("click", onSkipEssay);
}

/* ── Save/Skip essays ──────────────────── */
function onSaveEssay() {
  const textarea = document.getElementById("essayText");
  const text = textarea ? textarea.value.trim() : "";
  const h3 = document.querySelector("#essaySection h3");
  const idx = h3 ? parseInt(h3.textContent.match(/\d+/)[0]) - 1 : 0;
  recordEssay(idx, text, false);
  advanceEssay();
}

function onSkipEssay() {
  const h3 = document.querySelector("#essaySection h3");
  const idx = h3 ? parseInt(h3.textContent.match(/\d+/)[0]) - 1 : 0;
  recordEssay(idx, "", true);
  advanceEssay();
}

let essayPhase = 0;
function advanceEssay() {
  essayPhase++;
  const prompts = getEssayPrompts();
  if (essayPhase < prompts.length) {
    renderEssay(essayPhase);
    bindEssayListeners();
  } else {
    essayPhase = 0;
    showResults();
  }
}

/* ── Show results ──────────────────────── */
function showResults() {
  state.phase = "result";
  renderResult();
  showScreen("screen-result");
  updateTopBar();
  bindResultListeners();
}

/* ── Bind result listeners ─────────────── */
function bindResultListeners() {
  const restart = document.getElementById("btnRestart");
  const copy = document.getElementById("btnCopy");
  const download = document.getElementById("btnDownload");

  if (restart) {
    restart.addEventListener("click", () => {
      showScreen("screen-welcome");
      resetState();
      essayPhase = 0;
      updateTopBar();
    });
  }

  if (copy) {
    copy.addEventListener("click", () => {
      const out = document.getElementById("promptOutput");
      if (!out) return;
      navigator.clipboard.writeText(out.textContent)
        .then(() => showToast("Copied to clipboard!"))
        .catch(() => showToast("Failed to copy"));
    });
  }

  if (download) {
    download.addEventListener("click", () => {
      const out = document.getElementById("promptOutput");
      if (!out) return;
      const blob = new Blob([out.textContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lingoquest-result.json";
      a.click();
      URL.revokeObjectURL(url);
      showToast("Downloaded!");
    });
  }
}

/* ── Welcome screen listener ───────────── */
function bindWelcomeListeners() {
  const startBtn = document.querySelector("#screen-welcome .btn-primary");
  if (startBtn) {
    startBtn.addEventListener("click", startTest);
  }
}

/* ── Init ──────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  bindWelcomeListeners();
  updateTopBar();

  // Verify QUESTIONS loaded
  if (!QUESTIONS || QUESTIONS.length === 0) {
    console.error("QUESTIONS not loaded");
    showToast("Error: Question bank not loaded");
  }
});