/**
 * BioQuest — Game Logic (app.js)
 * --------------------------------
 * Orchestrates all UI screens and game state.
 * Calls the backend via the functions in api.js.
 *
 * Screens:
 *   #screen-login       — enter username
 *   #screen-quest       — view active quest, submit photo
 *   #screen-result      — show AI verification result + facts
 *   #screen-leaderboard — top 50 players
 *
 * State is kept in memory; userId/username are also persisted to
 * localStorage so a page refresh doesn't log the user out.
 */

import {
  getOrCreateUser,
  getActiveQuest,
  createQuest,
  submitPhoto,
  getLeaderboard,
} from "./api.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state = {
  userId: null,
  username: null,
  quest: null, // current active quest object (or null)
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  restoreSession();
  bindEvents();
});

/**
 * If a userId is saved in localStorage, skip the login screen and
 * go straight to the quest screen.
 */
function restoreSession() {
  const savedId = localStorage.getItem("bq_userId");
  const savedName = localStorage.getItem("bq_username");
  if (savedId && savedName) {
    state.userId = Number(savedId);
    state.username = savedName;
    showScreen("screen-quest");
    loadQuest();
  } else {
    showScreen("screen-login");
  }
}

// ---------------------------------------------------------------------------
// Event bindings — wire up every button/form in index.html
// ---------------------------------------------------------------------------

function bindEvents() {
  // Login form
  document.getElementById("form-login").addEventListener("submit", onLogin);

  // Quest screen buttons
  document.getElementById("btn-new-quest").addEventListener("click", onNewQuest);
  document.getElementById("btn-leaderboard").addEventListener("click", onShowLeaderboard);
  document.getElementById("btn-logout").addEventListener("click", onLogout);

  // Photo submission
  document.getElementById("form-submit").addEventListener("submit", onSubmitPhoto);

  // Result screen
  document.getElementById("btn-next-quest").addEventListener("click", onNewQuest);
  document.getElementById("btn-back-quest").addEventListener("click", () => showScreen("screen-quest"));

  // Leaderboard screen
  document.getElementById("btn-back-from-leaderboard").addEventListener("click", () => showScreen("screen-quest"));
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Login: call getOrCreateUser, save session, load quest.
 */
async function onLogin(e) {
  e.preventDefault();
  const username = document.getElementById("input-username").value.trim();
  if (!username) return;

  setLoading("btn-login", true);
  try {
    const user = await getOrCreateUser(username);
    state.userId = user.id;
    state.username = user.username;
    localStorage.setItem("bq_userId", user.id);
    localStorage.setItem("bq_username", user.username);

    showScreen("screen-quest");
    loadQuest();
  } catch (err) {
    showError("error-login", err.message);
  } finally {
    setLoading("btn-login", false);
  }
}

/**
 * Load the user's active quest (or prompt them to start one).
 */
async function loadQuest() {
  setLoading("btn-new-quest", true);
  try {
    const quest = await getActiveQuest(state.userId);
    state.quest = quest;
    renderQuest(quest);
  } catch (err) {
    showError("error-quest", err.message);
  } finally {
    setLoading("btn-new-quest", false);
  }
}

/**
 * Abandon the current quest and generate a new one.
 */
async function onNewQuest() {
  setLoading("btn-new-quest", true);
  try {
    const quest = await createQuest(state.userId);
    state.quest = quest;
    renderQuest(quest);
    showScreen("screen-quest");
  } catch (err) {
    showError("error-quest", err.message);
  } finally {
    setLoading("btn-new-quest", false);
  }
}

/**
 * Submit the selected photo for AI verification.
 */
async function onSubmitPhoto(e) {
  e.preventDefault();
  const fileInput = document.getElementById("input-photo");
  const file = fileInput.files[0];
  if (!file || !state.quest) return;

  setLoading("btn-submit", true);
  try {
    const result = await submitPhoto(state.quest.id, file);
    state.quest = result.quest;
    renderResult(result);
    showScreen("screen-result");
    fileInput.value = ""; // reset file input
  } catch (err) {
    showError("error-submit", err.message);
  } finally {
    setLoading("btn-submit", false);
  }
}

/**
 * Fetch and render the leaderboard.
 */
async function onShowLeaderboard() {
  showScreen("screen-leaderboard");
  setLoading("btn-back-from-leaderboard", true);
  try {
    const rows = await getLeaderboard();
    renderLeaderboard(rows);
  } catch (err) {
    showError("error-leaderboard", err.message);
  } finally {
    setLoading("btn-back-from-leaderboard", false);
  }
}

/**
 * Clear session and return to login.
 */
function onLogout() {
  localStorage.removeItem("bq_userId");
  localStorage.removeItem("bq_username");
  state = { userId: null, username: null, quest: null };
  showScreen("screen-login");
}

// ---------------------------------------------------------------------------
// Render helpers — update the DOM with fresh data
// ---------------------------------------------------------------------------

/**
 * Render the active quest card.
 * If quest is null the "no quest" empty state is shown instead.
 *
 * @param {object|null} quest
 */
function renderQuest(quest) {
  // Update greeting
  document.getElementById("txt-username").textContent = state.username;

  const questCard = document.getElementById("quest-card");
  const emptyState = document.getElementById("quest-empty");

  if (!quest) {
    questCard.hidden = true;
    emptyState.hidden = false;
    return;
  }

  questCard.hidden = false;
  emptyState.hidden = true;

  document.getElementById("txt-target").textContent = quest.target;
  document.getElementById("txt-category").textContent = quest.category.replace("_", " ");
  document.getElementById("txt-difficulty").textContent = quest.difficulty;
  document.getElementById("txt-progress").textContent = `${quest.progress} / ${quest.target_count}`;
  document.getElementById("txt-points-reward").textContent = quest.points_reward;

  // Progress bar (0–100%)
  const pct = Math.round((quest.progress / quest.target_count) * 100);
  document.getElementById("progress-bar").style.width = `${pct}%`;
  document.getElementById("progress-bar").setAttribute("aria-valuenow", pct);
}

/**
 * Render the AI verification result screen.
 *
 * @param {object} result  — shape: { matches, confidence, facts, points_awarded, quest_completed, quest }
 */
function renderResult(result) {
  const icon = document.getElementById("result-icon");
  const heading = document.getElementById("result-heading");
  const facts = document.getElementById("result-facts");
  const points = document.getElementById("result-points");
  const completedBanner = document.getElementById("result-completed");
  const btnNext = document.getElementById("btn-next-quest");
  const btnBack = document.getElementById("btn-back-quest");

  if (result.matches) {
    icon.textContent = "✅";
    heading.textContent = "Great find!";
  } else {
    icon.textContent = "❌";
    heading.textContent = "Not quite…";
  }

  facts.textContent = result.facts;
  points.textContent = result.points_awarded > 0
    ? `+${result.points_awarded} points`
    : "No points this time";

  // Show/hide quest-completed banner and action buttons
  if (result.quest_completed) {
    completedBanner.hidden = false;
    btnNext.hidden = false;
    btnBack.hidden = true;
  } else {
    completedBanner.hidden = true;
    btnNext.hidden = true;
    btnBack.hidden = false;
  }

  // Keep quest card in sync for when user navigates back
  renderQuest(result.quest);
}

/**
 * Render the leaderboard table.
 *
 * @param {object[]} rows — [{ username, points, quests_completed }]
 */
function renderLeaderboard(rows) {
  const tbody = document.getElementById("leaderboard-body");
  tbody.innerHTML = "";

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" style="text-align:center">No players yet</td>`;
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    // Highlight the current user's row
    if (row.username === state.username) {
      tr.classList.add("current-user");
    }
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(row.username)}</td>
      <td>${row.points}</td>
      <td>${row.quests_completed}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------------------------------
// UI utilities
// ---------------------------------------------------------------------------

/**
 * Show one screen and hide all others.
 * Screens are elements with class "screen" and an id like "screen-*".
 *
 * @param {string} id  — the id of the screen to show (without #)
 */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => {
    el.hidden = el.id !== id;
  });
}

/**
 * Display an inline error message inside a named element.
 * Pass an empty string to clear the error.
 *
 * @param {string} elementId
 * @param {string} message
 */
function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = message;
}

/**
 * Disable a button and show a spinner-style label while async work runs.
 *
 * @param {string} buttonId
 * @param {boolean} loading
 */
function setLoading(buttonId, loading) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = "…";
  } else {
    btn.textContent = btn.dataset.originalText || btn.textContent;
  }
}

/**
 * Escape user-provided strings before injecting into innerHTML.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
