/* ═══════════════════════════════════════════════════════
   LingoQuest — DOM Rendering (UI)
   Glassmorphism, micro-animations, confetti, skeleton,
   CEFR ladder (evidence-based), ARIA, focus management
   ═══════════════════════════════════════════════════════ */

import { CEFR, ITEM_DIFFICULTY, getItemDifficulty, QUESTIONS } from "./questions.js";
import { state } from "./state.js";
import { buildResultData, isBandSupported } from "./engine.js";

const LEVEL_LABELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

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
    // Show conservative evidence-based level; never display theta-derived
    // provisional bands as results.
    // Show evidence-based level when available; otherwise provisional indicator
    const reported = state.reportedLevel;
    const phase = state.phase;
    let displayLevel, ariaLabel;
    if (reported >= 0 && phase === "result") {
      displayLevel = LEVEL_LABELS[reported];
      ariaLabel = "Reported level: " + LEVEL_LABELS[reported];
    } else if (reported >= 0) {
      displayLevel = "Provisional " + LEVEL_LABELS[reported];
      ariaLabel = "Provisional level: " + LEVEL_LABELS[reported];
    } else {
      displayLevel = "Provisional —";
      ariaLabel = "Provisional: level not yet determined";
    }
    level.textContent = displayLevel;
    level.setAttribute("aria-label", ariaLabel);
  }

  // Badge pulse when theta-based level changes
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
  // This badge describes the item, not a claim about the learner.
  document.getElementById("qLevel").textContent = CEFR[q.level !== undefined ? q.level : 0] || "A1";
  document.getElementById("qLevel").setAttribute("aria-label", "Item difficulty band: " + (CEFR[q.level !== undefined ? q.level : 0] || "A1"));
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

/* ── CEFR ladder (evidence-based) ────────
 *
 * Shows each CEFR level with its status:
 *   Demonstrated — attempted >= 2 and accuracy >= 50%
 *   Tested       — attempted >= 1 but insufficient evidence
 *   Not tested   — no items attempted at this level
 *   Current      — the reported (evidence-based) level
 * ──────────────────────────────────────── */
export function renderCEFRLadder() {
  const ladder = document.getElementById("cefrLadder");
  if (!ladder) return;
  ladder.innerHTML = "";
  const p = state.perLevel;
  const reported = state.reportedLevel;

  LEVEL_LABELS.forEach((lvl, i) => {
    const rung = document.createElement("div");
    rung.className = "cefr-rung";
    rung.setAttribute("role", "listitem");

    const att = p.attempts[i];
    const corr = p.correct[i];
    const acc = att > 0 ? Math.round((corr / att) * 100) : 0;

    let label = lvl;
    let statusText = "";

    // Determine status
    if (i === reported && reported >= 0) {
      rung.classList.add("current");
      statusText = "current level";
    } else if (isBandSupported(i)) {
      // Demonstrated (but not the reported level if reported is lower)
      if (i < reported || reported < 0) {
        rung.classList.add("demonstrated");
        statusText = "demonstrated";
      }
    }

    if (att > 0 && !rung.classList.contains("current") && !rung.classList.contains("demonstrated")) {
      rung.classList.add("tested");
      statusText = "tested";
    }

    if (att === 0) {
      rung.classList.add("not-tested");
      statusText = "not tested";
    }

    // Build label with stats
    if (att > 0) {
      label = lvl + " (" + corr + "/" + att + ", " + acc + "%)";
    } else {
      label = lvl + " (—)";
    }
    label += " " + statusText;

    rung.textContent = lvl;
    if (att > 0) {
      const stat = document.createElement("span");
      stat.className = "rung-stat";
      stat.textContent = corr + "/" + att;
      rung.appendChild(stat);
    }
    rung.setAttribute("aria-label", label);

    ladder.appendChild(rung);
  });
}

/* ── Result rendering ──────────────────── */
export function renderResult() {
  const n = state.totalQuestions;
  const correct = state.totalCorrect;
  const accuracy = n > 0 ? Math.round((correct / n) * 100) : 0;
  const avgTime = state.perQTime ? state.perQTime.toFixed(1) : "0.0";
  const reported = state.reportedLevel;
  const reportedLabel = reported >= 0 ? LEVEL_LABELS[reported] : "Inconclusive";

  // Main result level
  const resultLevel = document.getElementById("resultLevel");
  if (resultLevel) {
    resultLevel.textContent = reportedLabel;
    resultLevel.setAttribute("aria-label", "Evidence-based level: " + reportedLabel);
  }
  document.getElementById("sCorrect").textContent = correct;
  document.getElementById("sTotal").textContent = n;
  document.getElementById("sAccuracy").textContent = accuracy + "%";
  document.getElementById("sTime").textContent = avgTime + "s";

  // Stop reason
  const stopReasonEl = document.getElementById("stopReason");
  if (stopReasonEl) {
    stopReasonEl.textContent = state.stopReason || "Test completed.";
  }

  // Per-level stats table
  renderPerLevelStats();

  // CEFR ladder
  renderCEFRLadder();

  // JSON output
  renderPromptJSON();
}

/* ── Per-level stats table ─────────────── */
function renderPerLevelStats() {
  const container = document.getElementById("perLevelStats");
  if (!container) return;
  const p = state.perLevel;
  const reported = state.reportedLevel;

  let html = `<table class="perlevel-table" aria-label="Per-level performance">
    <thead><tr>
      <th>Level</th><th>Attempted</th><th>Correct</th><th>Accuracy</th><th>Status</th>
    </tr></thead><tbody>`;

  LEVEL_LABELS.forEach((lvl, i) => {
    const att = p.attempts[i];
    const corr = p.correct[i];
    const acc = att > 0 ? Math.round((corr / att) * 100) : 0;
    let status;
    let cls = "";
    if (i === reported && reported >= 0) {
      status = "✓ Reported";
      cls = "level-current";
    } else if (isBandSupported(i)) {
      status = "✓ Demonstrated";
      cls = "level-demonstrated";
    } else if (att > 0) {
      status = "— Tested";
      cls = "level-tested";
    } else {
      status = "○ Not tested";
      cls = "level-untested";
    }
    html += `<tr class="${cls}">
      <td class="level-label">${lvl}</td>
      <td>${att}</td>
      <td>${corr}</td>
      <td>${att > 0 ? acc + "%" : "—"}</td>
      <td>${status}</td>
    </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

/* ── AI Assessment JSON ────────────────── */
export function renderPromptJSON() {
  const out = document.getElementById("promptOutput");
  if (!out) return;
  // Use the single production builder from engine.js
  const data = buildResultData();
  out.textContent = JSON.stringify(data, null, 2);
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

/* ── History list ──────────────────────── */
export function renderHistoryList(results) {
  const list = document.getElementById("historyList");
  const empty = document.getElementById("historyEmpty");
  if (!list || !empty) return;

  if (!results || results.length === 0) {
    list.innerHTML = "";
    empty.style.display = "";
    return;
  }

  empty.style.display = "none";
  list.innerHTML = results
    .map(r => {
      const date = r.timestamp ? new Date(r.timestamp).toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      }) : "Unknown date";
      const level = r.cefrLevel || r.estimatedCefr || r.estimated_cefr_level || "—";
      const theta = r.theta != null ? r.theta.toFixed(3) : "—";
      const total = r.totalQuestions || r.stats?.totalQuestions || 0;
      const correct = r.totalCorrect || r.stats?.correct || 0;
      const accuracy = total > 0 ? Math.round((correct / total) * 100) + "%" : "—%";
      const levelClass = (typeof level === "string" ? level : "—").toLowerCase().replace(/[^a-z0-9]/g, "");
      return `
        <button class="history-item" data-result-id="${r.resultId || ""}" type="button">
          <span class="h-date">${date}</span>
          <span class="h-level">${level}</span>
          <span class="h-theta">θ=${theta}</span>
          <span class="h-accuracy">${accuracy}</span>
        </button>`;
    })
    .join("");
}

/* ── History detail (reuses result template) ──── */
export function renderHistoryDetail(result) {
  if (!result) return;

  const n = result.totalQuestions || result.stats?.totalQuestions || 0;
  const correct = result.totalCorrect || result.stats?.correct || 0;
  const accuracy = n > 0 ? Math.round((correct / n) * 100) : 0;
  const avgTime = result.avgTime || result.stats?.avgTime || result.stats?.avg_time_per_question?.replace("s", "") || "0.0";
  const theta = result.theta || 0;
  const cefrLevel = result.cefrLevel || result.estimatedCefr || result.estimated_cefr_level || "A1";
  // CEFR is an object {0:"A1",...,5:"C2"} — find the key by value
  const cefrValues = Object.values(CEFR);
  const levelIdx = cefrValues.indexOf(cefrLevel);
  const safeLevelIdx = levelIdx !== -1 ? levelIdx : 0;

  const resultLevel = document.getElementById("resultLevel");
  if (resultLevel) {
    resultLevel.textContent = cefrLevel;
    resultLevel.setAttribute("aria-label", "Historical CEFR Level: " + cefrLevel);
  }
  document.getElementById("sCorrect").textContent = String(correct);
  document.getElementById("sTotal").textContent = String(n);
  document.getElementById("sAccuracy").textContent = accuracy + "%";
  document.getElementById("sTime").textContent = avgTime + "s";

  // Temporarily override state so ladder/prompt helpers work
  const savedTheta = state.theta;
  const savedLevel = state.level;
  state.theta = theta;
  state.level = safeLevelIdx;

  renderCEFRLadder(theta, safeLevelIdx);
  renderPromptJSON(correct, n, accuracy, avgTime);

  // Restore state
  state.theta = savedTheta;
  state.level = savedLevel;
}

/* ── Welcome returning ─────────────────── */
export function renderWelcomeReturning(profile) {
  const block = document.getElementById("welcomeReturning");
  const levelEl = document.getElementById("returningLevel");
  if (!block || !levelEl) return;

  if (profile && profile.latestCefr) {
    levelEl.textContent = profile.latestCefr;
    block.style.display = "";
  } else {
    block.style.display = "none";
  }
}