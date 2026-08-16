/**
 * BioQuest API Client
 * -------------------
 * All functions return a Promise that resolves with the parsed JSON response.
 * The base URL points to the Flask backend (default port 5050).
 * Change BASE_URL if the backend is hosted elsewhere.
 */

const BASE_URL = "https://glorious-rotary-phone-jrpp47rr47r2p65v-5050.app.github.dev/";// ---------------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------------

/**
 * Get or create a user by username.
 * Call this on login/register — it's idempotent (same username = same user).
 *
 * POST /api/users
 * Body: { username: string }
 *
 * Response:
 * {
 *   id: number,
 *   username: string,
 *   points: number,
 *   quests_completed: number,
 *   created_at: string   // ISO timestamp
 * }
 *
 * @param {string} username
 * @returns {Promise<object>} user object
 */
export async function getOrCreateUser(username) {
  const res = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  return handleResponse(res);
}

// ---------------------------------------------------------------------------
// QUESTS
// ---------------------------------------------------------------------------

/**
 * Get the current active quest for a user.
 * Returns null if the user has no active quest yet.
 *
 * GET /api/quests/active?user_id=<id>
 *
 * Response (or null):
 * {
 *   id: number,
 *   user_id: number,
 *   target: string,          // e.g. "a bee or other pollinator on a flower"
 *   category: string,        // e.g. "invertebrates"
 *   difficulty: string,      // "easy" | "medium" | "hard"
 *   target_count: number,    // how many photos needed to complete the quest
 *   progress: number,        // how many verified photos submitted so far
 *   points_reward: number,   // total points if fully completed
 *   points_per_item: number, // points awarded per verified photo
 *   completion_bonus: number,// bonus points for finishing all target_count photos
 *   status: string,          // "active" | "completed" | "abandoned"
 *   created_at: string
 * }
 *
 * @param {number} userId
 * @returns {Promise<object|null>}
 */
export async function getActiveQuest(userId) {
  const res = await fetch(`${BASE_URL}/api/quests/active?user_id=${userId}`);
  return handleResponse(res);
}

/**
 * Generate a new quest for a user.
 * Any currently active quest is automatically abandoned.
 *
 * POST /api/quests/new
 * Body: { user_id: number }
 *
 * Response: same shape as getActiveQuest (status will be "active")
 *
 * @param {number} userId
 * @returns {Promise<object>} new quest object
 */
export async function createQuest(userId) {
  const res = await fetch(`${BASE_URL}/api/quests/new`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  return handleResponse(res);
}

// ---------------------------------------------------------------------------
// SUBMISSIONS
// ---------------------------------------------------------------------------

/**
 * Submit a photo for the active quest.
 * The backend uses Claude AI to verify whether the photo matches the target.
 *
 * POST /api/submit
 * Body: multipart/form-data
 *   - quest_id: number (as a form field)
 *   - image: File  (JPEG, PNG, or WebP — max 15 MB)
 *
 * Response:
 * {
 *   matches: boolean,         // true if the photo genuinely shows the target
 *   confidence: string,       // "low" | "medium" | "high"
 *   facts: string,            // 2-3 interesting facts about what's in the photo
 *   points_awarded: number,   // points earned this submission (0 if no match)
 *   quest_completed: boolean, // true if this submission finished the quest
 *   quest: object             // updated quest object (same shape as getActiveQuest)
 * }
 *
 * @param {number} questId
 * @param {File} imageFile
 * @returns {Promise<object>} submission result
 */
export async function submitPhoto(questId, imageFile) {
  const formData = new FormData();
  formData.append("quest_id", questId);
  formData.append("image", imageFile);

  const res = await fetch(`${BASE_URL}/api/submit`, {
    method: "POST",
    body: formData,
    // Do NOT set Content-Type header — the browser sets it automatically
    // with the correct multipart boundary when using FormData.
  });
  return handleResponse(res);
}

// ---------------------------------------------------------------------------
// LEADERBOARD
// ---------------------------------------------------------------------------

/**
 * Fetch the top 50 users by points.
 *
 * GET /api/leaderboard
 *
 * Response: array of up to 50 entries, sorted by points desc:
 * [
 *   {
 *     username: string,
 *     points: number,
 *     quests_completed: number
 *   },
 *   ...
 * ]
 *
 * @returns {Promise<object[]>}
 */
export async function getLeaderboard() {
  const res = await fetch(`${BASE_URL}/api/leaderboard`);
  return handleResponse(res);
}

// ---------------------------------------------------------------------------
// INTERNAL HELPER
// ---------------------------------------------------------------------------

/**
 * Parses the response and throws a descriptive error on non-2xx status.
 * All API error responses from the backend have the shape: { error: string }
 *
 * @param {Response} res
 * @returns {Promise<any>}
 */
async function handleResponse(res) {
  const data = await res.json();
  if (!res.ok) {
    const message = data?.error || `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return data;
}
