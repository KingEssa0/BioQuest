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
  signIn,
  signUp,
  getActiveQuest,
  getActiveQuests,
  getQuestOptions,
  selectQuest,
  getUserStats,
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
  quests: [],
  options: [],
  stats: null,
};

let authMode = "signin";

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  restoreTheme();
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
    showRoute(window.location.pathname, false);
  } else {
    showScreen("screen-login");
  }
}

// ---------------------------------------------------------------------------
// Event bindings — wire up every button/form in index.html
// ---------------------------------------------------------------------------

function bindEvents() {
  // Helper: attach a listener only if the element exists, so a missing ID
  // in index.html throws a clear console warning instead of crashing the app.
  function on(id, event, handler) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener(event, handler);
    } else {
      console.warn(`[BioQuest] bindEvents: element #${id} not found in DOM`);
    }
  }

  // Login form
  on("form-login", "submit", onLogin);
  on("btn-auth-toggle", "click", toggleAuthMode);

  // Quest screen buttons
  on("btn-new-quest", "click", onNewQuest);
  on("btn-leaderboard", "click", () => showRoute("/leaderboard"));
  on("btn-logout", "click", onLogout);

  // Theme
  on("btn-theme", "click", toggleTheme);
  on("btn-settings-logout", "click", onLogout);
  on("pref-tips", "change", onPreferenceChanged);
  on("pref-reduced-motion", "change", onPreferenceChanged);

  // Photo submission
  on("form-submit", "submit", onSubmitPhoto);
  on("input-photo", "change", onPhotoSelected);

  // Empty-state quest button
  on("btn-new-quest-empty", "click", onNewQuest);

  // Result screen
  on("btn-next-quest", "click", onNewQuest);
  on("btn-back-quest", "click", () => showScreen("screen-quest"));

  // Leaderboard screen
  on("btn-back-from-leaderboard", "click", () => showRoute("/dashboard"));

  document.querySelectorAll("[data-route]").forEach((el) => {
    el.addEventListener("click", () => showRoute(`/${el.dataset.route}`));
  });
  ["active-quests-list", "quest-options-list"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", onQuestBoardClick);
  });
  window.addEventListener("popstate", () => showRoute(window.location.pathname, false));
}

function onPhotoSelected(e) {
  const fileName = document.getElementById("file-name");
  if (fileName) {
    fileName.textContent = e.target.files[0]?.name || "No photo selected.";
  }
}

/** Log in or create a user, then load their active quest. */
async function onLogin(e) {
  e.preventDefault();

  const email = document.getElementById("input-email").value.trim();
  const password = document.getElementById("input-password").value;
  const username = document.getElementById("input-username").value.trim();
  const confirmation = document.getElementById("input-password-confirm").value;
  if (!email || !password) return;
  if (authMode === "signup" && password !== confirmation) {
    showError("error-login", "Passwords do not match.");
    return;
  }

  setLoading("btn-login", true);
  showError("error-login", "");

  try {
    const user = authMode === "signup"
      ? await signUp(email, username, password)
      : await signIn(email, password);
    state.userId = user.id;
    state.username = user.username;
    localStorage.setItem("bq_userId", String(user.id));
    localStorage.setItem("bq_username", user.username);
    showRoute("/dashboard");
  } catch (err) {
    showError("error-login", err.message);
  } finally {
    setLoading("btn-login", false);
  }
}

function toggleAuthMode() {
  authMode = authMode === "signin" ? "signup" : "signin";
  const signupFields = document.getElementById("signup-fields");
  const password = document.getElementById("input-password");
  const heading = document.getElementById("auth-heading");
  const submit = document.getElementById("btn-login");
  const toggle = document.getElementById("btn-auth-toggle");
  const confirm = document.getElementById("input-password-confirm");
  const username = document.getElementById("input-username");
  const signup = authMode === "signup";
  signupFields.hidden = !signup;
  username.required = signup;
  confirm.required = signup;
  password.autocomplete = signup ? "new-password" : "current-password";
  heading.textContent = signup ? "Create an account to start exploring." : "Sign in to continue your adventure.";
  submit.textContent = signup ? "Create Account" : "Sign In";
  toggle.textContent = signup ? "I already have an account" : "Create an account";
  showError("error-login", "");
}

function showRoute(path, push = true) {
  const route = ["/", "/dashboard", "/quests", "/leaderboard", "/settings", "/login"].includes(path)
    ? path
    : "/dashboard";
  if (push) history.pushState({}, "", route);

  if (!state.userId && route !== "/login") {
    showScreen("screen-login");
    return;
  }
  if (route === "/login") {
    showScreen("screen-login");
    return;
  }
  if (route === "/dashboard" || route === "/") {
    showScreen("screen-dashboard");
    loadDashboard();
  } else if (route === "/quests") {
    showScreen("screen-quest");
    loadQuestBoard();
  } else if (route === "/leaderboard") {
    showScreen("screen-leaderboard");
    onShowLeaderboard();
  } else if (route === "/settings") {
    showScreen("screen-settings");
    loadSettings();
  }
}

async function loadDashboard() {
  try {
    state.stats = await getUserStats(state.userId);
    document.getElementById("dashboard-username").textContent = state.stats.username;
    document.getElementById("stat-points").textContent = state.stats.points;
    document.getElementById("stat-completed").textContent = state.stats.quests_completed;
    document.getElementById("stat-active").textContent = `${state.stats.active_quests} / 6`;
  } catch (err) {
    console.error("DASHBOARD ERROR:", err);
  }
}

async function loadSettings() {
  try {
    state.stats = state.stats || await getUserStats(state.userId);
    document.getElementById("settings-email").textContent = state.stats.email || "Not available";
    document.getElementById("settings-username").textContent = state.stats.username;
    restorePreferences();
  } catch (err) {
    console.error("SETTINGS ERROR:", err);
  }
}

function restorePreferences() {
  const tips = document.getElementById("pref-tips");
  const reducedMotion = document.getElementById("pref-reduced-motion");
  if (tips) tips.checked = localStorage.getItem("bq_showTips") !== "false";
  if (reducedMotion) {
    reducedMotion.checked = localStorage.getItem("bq_reducedMotion") === "true";
    document.body.classList.toggle("reduced-motion", reducedMotion.checked);
  }
}

function onPreferenceChanged(e) {
  if (e.target.id === "pref-tips") {
    localStorage.setItem("bq_showTips", String(e.target.checked));
  }
  if (e.target.id === "pref-reduced-motion") {
    localStorage.setItem("bq_reducedMotion", String(e.target.checked));
    document.body.classList.toggle("reduced-motion", e.target.checked);
  }
}

async function loadQuestBoard() {
  try {
    const [quests, options] = await Promise.all([
      getActiveQuests(state.userId),
      getQuestOptions(state.userId),
    ]);
    state.quests = quests;
    state.options = options;
    state.quest = quests[0] || null;
    renderQuestBoard();
    renderQuest(state.quest);
  } catch (err) {
    showError("error-options", err.message);
  }
}

function renderQuestBoard() {
  const activeList = document.getElementById("active-quests-list");
  const optionsList = document.getElementById("quest-options-list");
  const capacity = document.getElementById("quest-capacity");
  if (!activeList || !optionsList) return;

  capacity.textContent = `${state.quests.length} / 6 unfinished`;
  activeList.innerHTML = state.quests.length
    ? state.quests.map((quest) => questCard(quest, true)).join("")
    : `<p class="empty-board">No unfinished quests yet. Pick one below to get started!</p>`;
  optionsList.innerHTML = state.options.map((option) => questCard(option, false)).join("");
  if (state.quests.length >= 6) {
    optionsList.innerHTML = `<p class="empty-board">You have six unfinished quests. Complete one before choosing another.</p>`;
  }
}

function questCard(quest, active) {
  const action = active
    ? `<button class="small-button quest-select" data-quest-id="${quest.id}" type="button">View Quest</button>`
    : `<button class="small-button quest-select" data-target="${escapeHtml(quest.target)}" type="button">Add Quest</button>`;
  return `<article class="quest-list-card">
    <div><span class="difficulty difficulty-${quest.difficulty}">${quest.difficulty}</span><h3>${escapeHtml(quest.target)}</h3>
    <p>${escapeHtml(quest.category.replace("_", " "))} · ${quest.points_reward} points</p></div>${action}</article>`;
}

async function onQuestBoardClick(e) {
  const button = e.target.closest(".quest-select");
  if (!button) return;
  try {
    if (button.dataset.questId) {
      state.quest = state.quests.find((quest) => String(quest.id) === button.dataset.questId) || state.quest;
      renderQuest(state.quest);
      document.getElementById("quest-card")?.scrollIntoView({ behavior: "smooth" });
    } else {
      await selectQuest(state.userId, button.dataset.target);
      await loadQuestBoard();
    }
  } catch (err) {
    showError("error-options", err.message);
  }
}

/**
 * Load the user's active quest (or prompt them to start one).
 */
async function loadQuest() {
  console.log("1. loadQuest started");

  setLoading("btn-new-quest", true);

  try {
    console.log("2. requesting active quest...");

    const quest = await getActiveQuest(state.userId);

    console.log("3. quest response:", quest);

    state.quest = quest;

    console.log("4. rendering quest...");
    renderQuest(quest);

    console.log("5. renderQuest finished");
  } catch (err) {
    console.error("LOAD QUEST ERROR:", err);
    showError("error-quest", err.message);
  } finally {
    console.log("6. loadQuest finished");
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
    await loadQuestBoard();
    history.pushState({}, "", "/quests");
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
  state = { userId: null, username: null, quest: null, quests: [], options: [], stats: null };
  showRoute("/login");
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
    questCard.style.display = "none";
    emptyState.style.display = "block";
    return;
  }

  questCard.style.display = "block";
  emptyState.style.display = "none";

  document.getElementById("txt-target").textContent = quest.target;
  document.getElementById("txt-category").textContent = quest.category.replace("_", " ");

  // Difficulty badge
  const badge = document.getElementById("badge-difficulty");
  if (badge) {
    badge.textContent = quest.difficulty;
    badge.className = `badge badge-${quest.difficulty}`;
  }

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
    completedBanner.style.display = "block";
    btnNext.style.display = "inline-block";
    btnBack.style.display = "none";
  } else {
    completedBanner.style.display = "none";
    btnNext.style.display = "none";
    btnBack.style.display = "inline-block";
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
    const active = el.id === id;
    el.classList.toggle("active", active);
    el.hidden = !active;
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

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function toggleTheme() {
  document.body.classList.toggle("dark-theme");

  const isDark = document.body.classList.contains("dark-theme");

  localStorage.setItem("bq_theme", isDark ? "dark" : "light");

  updateThemeButton();
}

function updateThemeButton() {
  const button = document.getElementById("btn-theme");
  if (!button) return;

  const isDark = document.body.classList.contains("dark-theme");

  button.textContent = isDark
    ? "☀️ Light Mode"
    : "🌙 Dark Mode";
}

function restoreTheme() {
  const savedTheme = localStorage.getItem("bq_theme");

  if (savedTheme === "dark") {
    document.body.classList.add("dark-theme");
  }

  updateThemeButton();
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
