/* ═══════════════════════════════════════════════════════
   LingoQuest — Entry Point & Event Wiring
   Skeleton loading, confetti, focus, input locking
   ═══════════════════════════════════════════════════════ */

import { QUESTIONS } from "./questions.js";
import { state, resetState, recordResponse, recordEssay } from "./state.js";
import { eapEstimate, levelFromTheta, pickQuestion, shouldStop } from "./engine.js";
import {
  showScreen, updateTopBar, renderQuestion, showAnswerFeedback,
  renderEssay, renderResult, showToast, getEssayPrompts,
  showSkeleton, fireConfetti, resetConfetti, announce
} from "./ui.js";

let inputLocked = false;
let essayPhase = 0;

/* ── Start test ────────────────────────── */
function startTest() {
  resetState();
  resetConfetti();
  state.phase = "testing";
  state.testStartTime = Date.now();
  state.prevLevel = 0;
  state.level = 0;

  showSkeleton(true);
  showScreen("screen-question");
  updateTopBar();

  // Short delay before showing first question (skeleton visible)
  setTimeout(() => {
    loadNextQuestion();
    showSkeleton(false);
  }, 400);
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

  renderQuestion(q, state.totalQuestions + 1);
  bindOptionListeners();
  inputLocked = false;
}

/* ── Bind option listeners ─────────────── */
function bindOptionListeners() {
  document.querySelectorAll("#qOptions .option").forEach(btn => {
    btn.addEventListener("click", onOptionClick);
  });
}

/* ── Option click handler ──────────────── */
function onOptionClick(e) {
  if (inputLocked) return;
  const btn = e.currentTarget;
  const idx = parseInt(btn.dataset.index, 10);
  const q = state.currentQ;
  if (!q) return;

  inputLocked = true;

  const correct = idx === q.a;
  const b = q.level !== undefined
    ? [-2.0, -1.0, 0.0, 1.0, 2.0, 3.0][Math.min(5, q.level)]
    : 0;

  recordResponse(q.id, correct, b, q.q, q.opts, idx);
  showAnswerFeedback(idx, q.a);

  state.theta = eapEstimate(state.responses);
  state.prevLevel = state.level;
  state.level = levelFromTheta(state.theta);

  // Update qNum for the just-answered question
  document.getElementById("qNum").textContent = state.totalQuestions + " / " + Math.min(state.totalQuestions + 5, 40);

  updateTopBar();

  // Show skeleton during transition
  setTimeout(() => {
    if (shouldStop()) {
      finishTest();
    } else {
      showSkeleton(true);
      // Brief skeleton display then next question
      setTimeout(() => {
        loadNextQuestion();
        showSkeleton(false);
      }, 300);
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
  announce("Essay section. " + getEssayPrompts().length + " optional writing prompts.");
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

function advanceEssay() {
  essayPhase++;
  const prompts = getEssayPrompts();
  if (essayPhase < prompts.length) {
    renderEssay(essayPhase);
    bindEssayListeners();
    announce("Essay " + (essayPhase + 1) + " of " + prompts.length);
  } else {
    essayPhase = 0;
    // Brief transition before showing results
    setTimeout(showResults, 300);
  }
}

/* ── Show results ──────────────────────── */
function showResults() {
  state.phase = "result";
  renderResult();
  showScreen("screen-result");
  updateTopBar();
  bindResultListeners();
  announce("Test complete. Estimated level: " + (state.level !== undefined ? ["A1","A2","B1","B2","C1","C2"][state.level] : ""));
  // Fire confetti on result reveal
  setTimeout(() => fireConfetti(), 500);
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
      resetConfetti();
      essayPhase = 0;
      inputLocked = false;
      updateTopBar();
      announce("Returned to welcome screen");
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

  // Announce app ready
  announce("LingoQuest adaptive English level test loaded. Press Start Test to begin.");
});