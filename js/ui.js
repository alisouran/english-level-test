/* ═══════════════════════════════════════════════════════
   LingoQuest — DOM Rendering (UI)
   Glassmorphism, micro-animations, confetti, skeleton,
   CEFR ladder redesign, ARIA updates, focus management
   ═══════════════════════════════════════════════════════ */

import { CEFR, ITEM_DIFFICULTY, getItemDifficulty, QUESTIONS } from "./questions.js";
import { state } from "./state.js";

/* ── ARIA live region helper ──────────── */
export function announce(msg) {
  const el = document.getElementById("ariaLive");
  if (el) {
    el.textContent = "";
    requestAnimationFrame(() => { el.textContent = msg; });
  }
}

/* ── Screen helper ────────────────────── */
export function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
  window.dispatchEvent(new Event("resize"));

  // Focus management
  requestAnimationFrame(() => {
    let target;
    if (id === "screen-welcome") {
      target = document.getElementById("btnStart");
    } else if (id === "screen-question") {
      target = document.getElementById("qText");
    } else if (id === "screen-essay") {
      target = document.querySelector("#essaySection h3");
    } else if (id === "screen-result") {
      target = document.getElementById("resultLevel");
    }
    if (target) {
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  });
}

/* ── Top Bar ───────────────────────────── */
export function updateTopBar() {
  const score = document.getElementById("topScore");
  const level = document.getElementById("topLevel");
  const progress = document.getElementById("progressFill");
  const progressTrack = document.querySelector(".progress-track");

  if (score) score.textContent = state.totalCorrect + " / " + state.totalQuestions;
  if (level) {
    level.textContent = CEFR[state.level] || "A1";
    level.setAttribute("aria-label", "Current level: " + (CEFR[state.level] || "A1"));
  }

  // Badge pulse when level changes
  if (level && state.level !== state.prevLevel && state.totalQuestions > 1) {
    level.classList.remove("badge-pulse");
    void level.offsetWidth;
    level.classList.add("badge-pulse");
  }

  // Progress bar — estimated max ~35 questions
  if (progress) {
    const estimatedMax = 35;
    const pct = Math.min(100, Math.round((state.totalQuestions / estimatedMax) * 100));
    progress.style.width = pct + "%";
    if (progressTrack) {
      progressTrack.setAttribute("aria-valuenow", String(pct));
    }
  }
}

/* ── Skeleton loading ─────────────────── */
export function showSkeleton(visible) {
  const skeleton = document.getElementById("qSkeleton");
  const qText = document.getElementById("qText");
  const qOptions = document.getElementById("qOptions");
  if (!skeleton) return;
  if (visible) {
    skeleton.classList.add("skeleton--visible");
    if (qText) qText.style.display = "none";
    if (qOptions) qOptions.style.display = "none";
    skeleton.setAttribute("aria-busy", "true");
  } else {
    skeleton.classList.remove("skeleton--visible");
    if (qText) qText.style.display = "";
    if (qOptions) qOptions.style.display = "";
    skeleton.setAttribute("aria-busy", "false");
  }
}

/* ── Question rendering ────────────────── */
export function renderQuestion(q, qNum) {
  const total = Math.min(qNum + 5, 40);
  document.getElementById("qNum").textContent = qNum + " / " + total;
  document.getElementById("qLevel").textContent = CEFR[state.level] || "A1";
  document.getElementById("qCategory").textContent = q.type + " · " + q.cat;
  document.getElementById("qText").textContent = q.q;

  const opts = document.getElementById("qOptions");
  opts.innerHTML = "";
  const labels = ["A", "B", "C", "D"];

  q.opts.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.type = "button";
    btn.dataset.index = i;
    btn.setAttribute("aria-label", labels[i] + ": " + opt);
    btn.innerHTML = `
      <span class="o-letter">${labels[i]}</span>
      <span class="opt-text">${opt}</span>
      <span class="feedback-icon" aria-hidden="true"></span>
    `;
    opts.appendChild(btn);
  });
}

/* ── Answer feedback ───────────────────── */
export function showAnswerFeedback(selectedIdx, correctIdx) {
  const btns = document.querySelectorAll("#qOptions .option");
  let correctText = "";
  btns.forEach((btn, i) => {
    btn.classList.remove("selected", "correct", "wrong");
    const feedbackIcon = btn.querySelector(".feedback-icon");
    if (feedbackIcon) feedbackIcon.textContent = "";

    if (i === correctIdx) {
      btn.classList.add("correct");
      correctText = btn.querySelector(".opt-text")?.textContent || "";
      if (i !== selectedIdx) {
        if (feedbackIcon) feedbackIcon.textContent = "✓";
      }
    }
    if (i === selectedIdx) {
      btn.classList.add("selected");
      if (i === correctIdx) {
        if (feedbackIcon) feedbackIcon.textContent = "✓";
      } else {
        btn.classList.add("wrong");
        if (feedbackIcon) feedbackIcon.textContent = "✗";
      }
    }
    btn.disabled = true;
  });

  // Announce result
  const selectedText = btns[selectedIdx]?.querySelector(".opt-text")?.textContent || "";
  if (selectedIdx === correctIdx) {
    announce("Correct! " + selectedText);
  } else {
    announce("Incorrect. The correct answer was " + correctText);
  }
}

/* ── Essay rendering ───────────────────── */
const ESSAY_PROMPTS = [
  "Describe a time you learned something new. What was it, how did you learn it, and why was it important to you? Write at least 3 sentences.",
  "Describe your favorite place. Where is it, what does it look like, and why do you like it? Write at least 3 sentences."
];

let currentEssayIdx = 0;

export function renderEssay(idx) {
  currentEssayIdx = idx;
  const section = document.getElementById("essaySection");
  if (!section) return;

  const prompt = ESSAY_PROMPTS[idx] || "Write about the topic above.";
  section.innerHTML = `
    <h3 id="essayPrompt${idx}">Essay ${idx + 1} of ${ESSAY_PROMPTS.length}</h3>
    <div class="prompt" aria-labelledby="essayPrompt${idx}">${prompt}</div>
    <textarea id="essayText" placeholder="Write your answer here..." rows="5" aria-label="Essay ${idx + 1}"></textarea>
    <div class="essay-actions">
      <button class="btn-primary" id="btnSaveEssay" type="button">✓ Save & Continue</button>
      <button class="btn-secondary" id="btnSkipEssay" type="button">Skip →</button>
    </div>
  `;
}

export function getEssayPrompts() {
  return ESSAY_PROMPTS;
}

/* ── CEFR ladder ───────────────────────── */
export function renderCEFRLadder(theta, levelIdx) {
  const ladder = document.getElementById("cefrLadder");
  if (!ladder) return;
  ladder.innerHTML = "";
  const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
  levels.forEach((lvl, i) => {
    const rung = document.createElement("div");
    rung.className = "cefr-rung";
    rung.setAttribute("role", "listitem");

    let label = lvl;
    if (i < levelIdx) {
      rung.classList.add("achieved");
      label += " achieved";
    }
    if (i === levelIdx) {
      rung.classList.add("current");
      label += " current level";
    }
    // Mark levels where at least one question was answered
    if (state.responses.some(r => {
      const b = getItemDifficulty(r.qId);
      const levelFromDiff = ITEM_DIFFICULTY.findIndex(d => d >= b);
      return levelFromDiff === i;
    })) {
      if (i !== levelIdx && i >= levelIdx) {
        rung.classList.add("tried");
      }
    }

    rung.textContent = lvl;
    rung.setAttribute("aria-label", label);
    ladder.appendChild(rung);
  });
  announce("CEFR level: " + (CEFR[state.level] || "A1"));
}

/* ── Result rendering ──────────────────── */
export function renderResult() {
  const n = state.totalQuestions;
  const correct = state.totalCorrect;
  const accuracy = n > 0 ? Math.round((correct / n) * 100) : 0;
  const avgTime = state.perQTime ? state.perQTime.toFixed(1) : "0.0";

  const resultLevel = document.getElementById("resultLevel");
  if (resultLevel) {
    resultLevel.textContent = CEFR[state.level] || "A1";
    resultLevel.setAttribute("aria-label", "Estimated CEFR Level: " + (CEFR[state.level] || "A1"));
  }
  document.getElementById("sCorrect").textContent = correct;
  document.getElementById("sTotal").textContent = n;
  document.getElementById("sAccuracy").textContent = accuracy + "%";
  document.getElementById("sTime").textContent = avgTime + "s";

  renderCEFRLadder(state.theta, state.level);
  renderPromptJSON(correct, n, accuracy, avgTime);
}

/* ── AI Assessment JSON ────────────────── */
function renderPromptJSON(correct, total, accuracy, avgTime) {
  const out = document.getElementById("promptOutput");
  if (!out) return;

  const prompt = {
    test: "LingoQuest Adaptive English Level Test",
    theta: state.theta,
    estimated_cefr_level: CEFR[state.level] || "A1",
    stats: {
      questions_answered: total,
      correct,
      accuracy: accuracy + "%",
      avg_time_per_question: avgTime + "s",
    },
    responses: state.responses.map(r => ({
      question_id: r.qId,
      question_text: r.questionText || "",
      options: r.options || [],
      selected_answer: r.selectedAnswer !== undefined ? r.selectedAnswer : -1,
      correct_answer: (() => {
        // Look up the correct answer index from the question data
        const question = QUESTIONS.find(q => q.id === r.qId);
        return question ? question.a : -1;
      })(),
      correct: r.correct,
      difficulty: getItemDifficulty(r.qId),
      time_taken: r.time.toFixed(1) + "s",
    })),
    essays: state.essays.filter(e => e && !e.skipped).map(e => ({
      prompt_index: e.prompt + 1,
      text: e.text,
    })),
  };

  out.textContent = JSON.stringify(prompt, null, 2);
}

/* ── Confetti ──────────────────────────── */
let confettiFired = false;

export function fireConfetti() {
  if (confettiFired) return;
  confettiFired = true;

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;

  const container = document.createElement("div");
  container.className = "confetti-container";
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);

  const colors = ["#6c5ce7", "#a29bfe", "#5caa74", "#7cca94", "#e57373", "#ffd54f", "#64b5f6"];
  const shapes = ["square", "circle"];

  for (let i = 0; i < 80; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = 6 + Math.random() * 8;
    const left = Math.random() * 100;
    const delay = Math.random() * 0.8;
    const duration = 2 + Math.random() * 2;
    const shape = shapes[Math.floor(Math.random() * shapes.length)];

    piece.style.cssText = `
      left:${left}%;width:${size}px;height:${size}px;
      background:${color};
      border-radius:${shape === "circle" ? "50%" : "2px"};
      animation-delay:${delay}s;
      animation-duration:${duration}s;
    `;
    container.appendChild(piece);
  }

  // Clean up after all animations complete
  setTimeout(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
    confettiFired = false;
  }, 4000);
}

export function resetConfetti() {
  confettiFired = false;
  document.querySelectorAll(".confetti-container").forEach(el => el.remove());
}

/* ── Toast ──────────────────────────────── */
export function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = "block";
  announce(msg);
  setTimeout(() => { toast.style.display = "none"; }, 2500);
}