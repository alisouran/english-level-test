/* ═══════════════════════════════════════════════════════
   LingoQuest — Entry Point & Event Wiring
   Skeleton loading, confetti, focus, input locking
   ═══════════════════════════════════════════════════════ */

import { QUESTIONS } from "./questions.js";
import { state, resetState, recordResponse, recordEssay } from "./state.js";
import { eapEstimate, levelFromTheta, computeReportedLevel, pickQuestion, shouldStop, INITIAL } from "./engine.js";
import {
  showScreen, updateTopBar, renderQuestion, showAnswerFeedback,
  renderEssay, renderResult, showToast, getEssayPrompts,
  showSkeleton, fireConfetti, resetConfetti, announce,
  renderHistoryList, renderHistoryDetail, renderWelcomeReturning
} from "./ui.js";
import {
  initDB, getUserId, clearUserId, getOrCreateProfile, updateProfile,
  saveResult, getResultsByUser, getResultById, getSeenQuestionIds, clearAllData
} from "./db.js";

let inputLocked = false;
let essayPhase = 0;
let showResultsGuard = false;  // prevent duplicate saves
let isFreshTest = false;       // attempt-local flag for fresh retake

/* ── Start test ────────────────────────── */
async function startTest() {
  resetState();
  resetConfetti();
  state.phase = "testing";
  state.testStartTime = Date.now();
  state.prevLevel = INITIAL;  // B1 start
  state.level = INITIAL;      // B1 start
  state.reportedLevel = -1;
  state.stopReason = "";
  state.userId = getUserId();
  state.resultId = crypto.randomUUID();

  // Show B1 start message (only once per session)
  showToast("It\u2019s okay if these feel difficult. This first group helps us find the right starting point.");

  // Check low-pool: count unseen questions
  const totalUnseen = QUESTIONS.filter(q => !state.seenQuestionIds.has(q.id)).length;
  if (totalUnseen < 10 && totalUnseen > 0) {
    showToast("Only " + totalUnseen + " new questions left. Consider Fresh Test for full item pool.");
  } else if (totalUnseen === 0 && !isFreshTest) {
    showToast("All previously seen questions exhausted. Use Fresh Test to reset.");
    showScreen("screen-welcome");
    return;
  }

  // For fresh test: use empty adminIds (fresh attempt-local set)
  // For regular retake: seenQuestionIds already blocks old questions via engine filter
  // In either case adminIds starts empty for this attempt

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
    state.stopReason = "Limited evidence: no unseen questions remain.";
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
  const b = q.b !== undefined ? q.b : 0;

  recordResponse(q.id, correct, b, q.q, q.opts, idx, q.level);
  showAnswerFeedback(idx, q.a);

  state.theta = eapEstimate(state.responses);
  state.prevLevel = state.level;
  state.level = levelFromTheta(state.theta);

  // Update qNum for the just-answered question
  document.getElementById("qNum").textContent = state.totalQuestions + " / " + Math.min(state.totalQuestions + 5, 40);

  updateTopBar();

  // Show skeleton during transition
  setTimeout(() => {
    if (shouldStop(QUESTIONS)) {
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
  state.reportedLevel = computeReportedLevel();

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
async function showResults() {
  if (showResultsGuard) return;
  showResultsGuard = true;

  state.duration = state.testStartTime ? Date.now() - state.testStartTime : 0;
  state.phase = "result";
  state.reportedLevel = computeReportedLevel();
  renderResult();
  showScreen("screen-result");
  updateTopBar();
  bindResultListeners();
  const supportedBand = state.reportedLevel >= 0 ? ["A1","A2","B1","B2","C1","C2"][state.reportedLevel] : "Inconclusive";
  announce("Test complete. Question-bank evidence: " + supportedBand + ". Listening and speaking were not assessed.");

  // Persist result to IndexedDB
  try {
    const userId = getUserId();
    const total = state.totalQuestions;
    const correct = state.totalCorrect;
    const cefrLevel = supportedBand;

    const resultData = {
      resultId: state.resultId,
      userId,
      timestamp: Date.now(),
      duration: state.duration,
      theta: state.theta,
      cefrLevel,
      cefrIndex: state.reportedLevel,
      totalQuestions: total,
      totalCorrect: correct,
      avgTime: state.perQTime ? state.perQTime : 0,
      responses: state.responses,
      essays: state.essays.filter(e => e && !e.skipped),
      // Legacy fields for backward compat with old ui.js reads
      estimatedCefr: cefrLevel,
      estimatedLevel: state.reportedLevel,
      stats: {
        totalQuestions: total,
        correct,
        accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
        avgTime: state.perQTime ? state.perQTime.toFixed(1) : "0.0",
        avg_time_per_question: state.perQTime ? state.perQTime.toFixed(1) + "s" : "0.0s",
      },
    };

    await saveResult(resultData);

    const profile = await getOrCreateProfile(userId);
    await updateProfile(userId, {
      totalTests: (profile.totalTests || 0) + 1,
      lastTestDate: Date.now(),
      latestTheta: state.theta,
      latestCefr: cefrLevel,
      thetaHistory: [...(profile.thetaHistory || []), state.theta],
      cefrHistory: [...(profile.cefrHistory || []), state.reportedLevel],
      lastResultId: state.resultId,
    });

    // Merge response qIds into state.seenQuestionIds to avoid re-seeing
    for (const resp of state.responses) {
      if (resp.qId) state.seenQuestionIds.add(resp.qId);
    }
  } catch (e) {
    console.warn("Could not persist result:", e);
  }

  // Fire confetti on result reveal
  setTimeout(() => fireConfetti(), 500);
}

/* ── Bind result listeners ─────────────── */
function bindResultListeners() {
  const restart = document.getElementById("btnRestart");
  const copy = document.getElementById("btnCopy");
  const download = document.getElementById("btnDownload");
  const retakeFresh = document.getElementById("btnRetakeFresh");

  if (restart) {
    restart.addEventListener("click", retakeTest);
  }

  if (retakeFresh) {
    retakeFresh.addEventListener("click", freshTest);
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

/* ── Retake (normal) ───────────────────── */
function retakeTest() {
  showResultsGuard = false;
  isFreshTest = false;
  showScreen("screen-welcome");
  resetState();
  resetConfetti();
  essayPhase = 0;
  inputLocked = false;
  updateTopBar();
  announce("Returned to welcome screen");
}

/* ── Fresh Test (allow old questions) ──── */
function freshTest() {
  // Confirm first
  if (!confirm("Start a fresh test? This will allow previously seen questions to appear again. Your history is preserved.")) {
    return;
  }
  showResultsGuard = false;
  isFreshTest = true;
  state.seenQuestionIds = new Set();  // clear seen set for this session
  resetState();
  resetConfetti();
  essayPhase = 0;
  inputLocked = false;
  startTest();
}

/* ── Show history list ─────────────────── */
async function showHistory() {
  try {
    const userId = getUserId();
    const results = await getResultsByUser(userId);
    renderHistoryList(results);
    showScreen("screen-history");
    updateTopBar();
    announce("Test history");

    // Bind card clicks by resultId
    const cards = document.querySelectorAll(".history-item");
    cards.forEach(card => {
      card.addEventListener("click", async () => {
        const resultId = card.dataset.resultId;
        if (!resultId) return;
        const result = await getResultById(resultId);
        if (result) {
          renderHistoryDetail(result);
          showScreen("screen-result");
          // Hide action buttons for historical view
          document.querySelectorAll(".result-actions .btn-primary, .result-actions .btn-secondary").forEach(b => {
            b.style.display = "none";
          });
          announce("Showing historical result");
        }
      });
    });
  } catch (e) {
    console.warn("Could not load history:", e);
    showToast("Failed to load history");
  }
}

/* ── Show settings screen ──────────────── */
function showSettings() {
  showScreen("screen-settings");
  updateTopBar();
  announce("Settings");
}

/* ── Welcome screen listener ───────────── */
function bindWelcomeListeners() {
  const startBtn = document.querySelector("#screen-welcome .btn-primary");
  if (startBtn) {
    startBtn.addEventListener("click", startTest);
  }

  const viewHistoryBtn = document.getElementById("btnViewHistory");
  if (viewHistoryBtn) {
    viewHistoryBtn.addEventListener("click", showHistory);
  }

  const settingsBtn = document.getElementById("btnSettings");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", showSettings);
  }
}

/* ── Navigation listeners ──────────────── */
function bindNavListeners() {
  const btnBackHistory = document.getElementById("btnBackHistory");
  if (btnBackHistory) {
    btnBackHistory.addEventListener("click", () => {
      showScreen("screen-welcome");
      // Show result action buttons again if they were hidden
      document.querySelectorAll(".result-actions .btn-primary, .result-actions .btn-secondary").forEach(b => {
        b.style.display = "";
      });
      announce("Returned to welcome");
    });
  }

  const btnBackSettings = document.getElementById("btnBackSettings");
  if (btnBackSettings) {
    btnBackSettings.addEventListener("click", () => {
      showScreen("screen-welcome");
      announce("Returned to welcome");
    });
  }

  const btnClearData = document.getElementById("btnClearData");
  if (btnClearData) {
    btnClearData.addEventListener("click", async () => {
      if (!confirm("This will permanently delete all your test results and profile data. Your history cannot be recovered. Continue?")) {
        return;
      }
      try {
        await clearAllData();
        clearUserId();
        state.userId = "";
        state.seenQuestionIds = new Set();
        isFreshTest = false;
        showResultsGuard = false;
        console.log("All data cleared");
        showToast("All data cleared. Reloading...");
        setTimeout(() => location.reload(), 1000);
      } catch (e) {
        console.warn("Clear data failed:", e);
        showToast("Failed to clear data");
      }
    });
  }
}

/* ── Init ──────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
  bindWelcomeListeners();
  bindNavListeners();
  updateTopBar();

  // Verify QUESTIONS loaded
  if (!QUESTIONS || QUESTIONS.length === 0) {
    console.error("QUESTIONS not loaded");
    showToast("Error: Question bank not loaded");
  }

  // Initialize IndexedDB persistence
  try {
    await initDB();
    const userId = getUserId();
    state.userId = userId;

    // Load previously-seen question IDs from all stored results
    const seenIds = await getSeenQuestionIds(userId);
    state.seenQuestionIds = seenIds;

    // Load profile and show welcome-back banner
    const profile = await getOrCreateProfile(userId);
    renderWelcomeReturning(profile);

    console.log("DB initialized for user:", userId, "seen:", seenIds.size);
  } catch (e) {
    console.warn("DB init failed (persistence unavailable):", e);
  }

  // Announce app ready
  announce("LingoQuest adaptive English level test loaded. Press Start Test to begin.");
});