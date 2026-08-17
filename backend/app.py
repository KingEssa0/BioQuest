import logging
import hashlib
import os
import uuid
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

import db
from ai_vision import verify_submission
from quests import DIFFICULTY_TIERS, QUEST_POOL, generate_quest

# Resolve the env file from this module, so launching with `python backend/app.py`
# from the repository root works just like launching it from backend/.
load_dotenv(Path(__file__).parent / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bioquest")

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_MEDIA_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
# Client compresses photos before upload, so this is a generous ceiling —
# it exists to fail fast with a clean error instead of hanging on a huge
# request if compression is ever skipped.
app.config["MAX_CONTENT_LENGTH"] = 15 * 1024 * 1024  # 15 MB
CORS(app)
db.init_app(app)


@app.errorhandler(Exception)
def handle_uncaught_exception(err):
    """Never let an unhandled error crash out to a raw HTML page mid-demo —
    always return JSON so the frontend can show a real message."""
    if isinstance(err, HTTPException):
        return jsonify({"error": err.description}), err.code

    logger.exception("Unhandled error")
    return jsonify({"error": "Something went wrong on our end. Please try again."}), 500


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/dashboard")
@app.get("/quests")
@app.get("/leaderboard")
@app.get("/login")
@app.get("/settings")
def frontend_route():
    """Serve the single-page frontend for each browser route."""
    return send_from_directory(app.static_folder, "index.html")


@app.post("/api/users")
def get_or_create_user():
    data = request.get_json(force=True)
    username = (data.get("username") or "").strip()
    if not username:
        return jsonify({"error": "username is required"}), 400
    if len(username) > 30:
        return jsonify({"error": "username must be 30 characters or fewer"}), 400

    conn = db.get_db()
    user = conn.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user is None:
        cur = conn.execute("INSERT INTO users (username) VALUES (?)", (username,))
        conn.commit()
        user = conn.execute(
            "SELECT * FROM users WHERE id = ?", (cur.lastrowid,)
        ).fetchone()

    return jsonify(dict(user))


def public_user(user):
    return {
        "id": user["id"],
        "email": user["email"],
        "username": user["username"],
        "points": user["points"],
        "quests_completed": user["quests_completed"],
    }


@app.post("/api/auth/signup")
def signup():
    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not email or "@" not in email:
        return jsonify({"error": "Enter a valid email address."}), 400
    if not username or len(username) > 30:
        return jsonify({"error": "Username must be between 1 and 30 characters."}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400

    conn = db.get_db()
    existing = conn.execute(
        "SELECT id FROM users WHERE email = ? OR username = ?", (email, username)
    ).fetchone()
    if existing:
        return jsonify({"error": "That email or username is already in use."}), 409

    cur = conn.execute(
        "INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)",
        (email, username, generate_password_hash(password)),
    )
    conn.commit()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(public_user(user)), 201


@app.post("/api/auth/signin")
def signin():
    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    user = db.get_db().execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if user is None or not user["password_hash"] or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Incorrect email or password."}), 401
    return jsonify(public_user(user))


@app.get("/api/quests/active")
def get_active_quest():
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400

    conn = db.get_db()
    quest = conn.execute(
        "SELECT * FROM quests WHERE user_id = ? AND status = 'active' "
        "ORDER BY created_at DESC LIMIT 1",
        (user_id,),
    ).fetchone()

    return jsonify(dict(quest) if quest else None)


@app.get("/api/quests/all")
def get_active_quests():
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400

    conn = db.get_db()
    quests = conn.execute(
        "SELECT * FROM quests WHERE user_id = ? AND status = 'active' "
        "ORDER BY created_at DESC, id DESC",
        (user_id,),
    ).fetchall()
    return jsonify([dict(quest) for quest in quests])


@app.get("/api/quests/options")
def get_quest_options():
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400

    conn = db.get_db()
    active = conn.execute(
        "SELECT target FROM quests WHERE user_id = ? AND status = 'active'",
        (user_id,),
    ).fetchall()
    excluded = {row["target"] for row in active}
    options = []
    for _ in range(6):
        option = generate_quest(exclude_targets=excluded)
        excluded.add(option["target"])
        options.append(option)
    return jsonify(options)


@app.get("/api/users/<int:user_id>/stats")
def get_user_stats(user_id):
    conn = db.get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if user is None:
        return jsonify({"error": "user not found"}), 404
    active_count = conn.execute(
        "SELECT COUNT(*) AS count FROM quests WHERE user_id = ? AND status = 'active'",
        (user_id,),
    ).fetchone()["count"]
    return jsonify({
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "points": user["points"],
        "quests_completed": user["quests_completed"],
        "active_quests": active_count,
    })


@app.post("/api/quests/new")
def create_quest():
    data = request.get_json(force=True)
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400

    conn = db.get_db()
    active_count = conn.execute(
        "SELECT COUNT(*) AS count FROM quests WHERE user_id = ? AND status = 'active'",
        (user_id,),
    ).fetchone()["count"]
    if active_count >= 6:
        return jsonify({"error": "You can have up to 6 unfinished quests."}), 400

    recent_targets = [
        row["target"]
        for row in conn.execute(
            "SELECT target FROM quests WHERE user_id = ? "
            "ORDER BY created_at DESC LIMIT 5",
            (user_id,),
        ).fetchall()
    ]
    quest = generate_quest(exclude_targets=recent_targets)

    cur = conn.execute(
        "INSERT INTO quests "
        "(user_id, target, category, difficulty, target_count, points_reward, "
        "points_per_item, completion_bonus) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            user_id,
            quest["target"],
            quest["category"],
            quest["difficulty"],
            quest["target_count"],
            quest["points_reward"],
            quest["points_per_item"],
            quest["completion_bonus"],
        ),
    )
    conn.commit()

    new_quest = conn.execute(
        "SELECT * FROM quests WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(dict(new_quest))


@app.post("/api/quests/select")
def select_quest():
    data = request.get_json(force=True)
    user_id = data.get("user_id")
    target = (data.get("target") or "").strip()
    selected = next((quest for quest in QUEST_POOL if quest[0] == target), None)
    if not user_id or selected is None:
        return jsonify({"error": "a valid quest selection is required"}), 400

    conn = db.get_db()
    active_count = conn.execute(
        "SELECT COUNT(*) AS count FROM quests WHERE user_id = ? AND status = 'active'",
        (user_id,),
    ).fetchone()["count"]
    if active_count >= 6:
        return jsonify({"error": "You can have up to 6 unfinished quests."}), 400

    category, difficulty = selected[1], selected[2]
    tier = DIFFICULTY_TIERS[difficulty]
    import random
    target_count = random.randint(*tier["count_range"])
    points_reward = target_count * tier["points_per_item"] + tier["completion_bonus"]
    cur = conn.execute(
        "INSERT INTO quests "
        "(user_id, target, category, difficulty, target_count, points_reward, "
        "points_per_item, completion_bonus) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (user_id, target, category, difficulty, target_count, points_reward,
         tier["points_per_item"], tier["completion_bonus"]),
    )
    conn.commit()
    quest = conn.execute("SELECT * FROM quests WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(quest))


@app.post("/api/submit")
def submit_photo():
    quest_id = request.form.get("quest_id", type=int)
    image = request.files.get("image")

    if not quest_id or not image:
        return jsonify({"error": "quest_id and image are required"}), 400

    media_type = image.mimetype
    if media_type not in ALLOWED_MEDIA_TYPES:
        return jsonify({"error": f"unsupported image type: {media_type}"}), 400

    conn = db.get_db()
    quest = conn.execute(
        "SELECT * FROM quests WHERE id = ? AND status = 'active'", (quest_id,)
    ).fetchone()
    if quest is None:
        return jsonify({"error": "no active quest with that id"}), 404

    image_bytes = image.read()
    if not image_bytes:
        return jsonify({"error": "the uploaded image was empty"}), 400

    # Reject duplicate images for the same quest — hash the bytes and check
    # against all previous submissions for this quest.
    image_hash = hashlib.sha256(image_bytes).hexdigest()
    duplicate = conn.execute(
        "SELECT id FROM submissions WHERE quest_id = ? AND image_hash = ?",
        (quest_id, image_hash),
    ).fetchone()
    if duplicate:
        return jsonify({"error": "You already submitted that photo for this quest. Try a different one!"}), 400

    filename = secure_filename(f"{uuid.uuid4().hex}{ALLOWED_MEDIA_TYPES[media_type]}")
    (UPLOAD_DIR / filename).write_bytes(image_bytes)

    try:
        result = verify_submission(image_bytes, media_type, quest["target"])
    except anthropic.RateLimitError:
        return jsonify({"error": "Too many requests right now — wait a few seconds and try again."}), 503
    except (anthropic.APIConnectionError, anthropic.APITimeoutError):
        return jsonify({"error": "Couldn't reach the verification service. Check your connection and try again."}), 503
    except anthropic.APIStatusError as e:
        logger.exception("Claude API error during verification")
        return jsonify({"error": "The verification service had a problem. Please try again."}), 502
    except Exception:
        logger.exception("Unexpected error during photo verification")
        return jsonify({"error": "Something went wrong verifying that photo. Please try again."}), 500

    conn.execute(
        "INSERT INTO submissions (quest_id, image_filename, image_hash, verified, facts) "
        "VALUES (?, ?, ?, ?, ?)",
        (quest_id, filename, image_hash, int(result["matches"]), result["facts"]),
    )

    quest_completed = False
    points_awarded = 0

    if result["matches"]:
        new_progress = quest["progress"] + 1
        points_awarded = quest["points_per_item"]
        quest_completed = new_progress >= quest["target_count"]

        if quest_completed:
            points_awarded += quest["completion_bonus"]
            conn.execute(
                "UPDATE quests SET progress = ?, status = 'completed' WHERE id = ?",
                (new_progress, quest_id),
            )
            conn.execute(
                "UPDATE users SET points = points + ?, quests_completed = quests_completed + 1 "
                "WHERE id = ?",
                (points_awarded, quest["user_id"]),
            )
        else:
            conn.execute(
                "UPDATE quests SET progress = ? WHERE id = ?", (new_progress, quest_id)
            )
            conn.execute(
                "UPDATE users SET points = points + ? WHERE id = ?",
                (points_awarded, quest["user_id"]),
            )

    conn.commit()

    updated_quest = conn.execute(
        "SELECT * FROM quests WHERE id = ?", (quest_id,)
    ).fetchone()

    return jsonify(
        {
            "matches": result["matches"],
            "confidence": result["confidence"],
            "facts": result["facts"],
            "points_awarded": points_awarded,
            "quest_completed": quest_completed,
            "quest": dict(updated_quest),
        }
    )


@app.get("/api/leaderboard")
def leaderboard():
    conn = db.get_db()
    rows = conn.execute(
        "SELECT username, points, quests_completed FROM users "
        "ORDER BY points DESC, quests_completed DESC LIMIT 50"
    ).fetchall()
    return jsonify([dict(r) for r in rows])


if __name__ == "__main__":
    # Debug mode is off by default — its auto-reloader and interactive
    # tracebacks are dev conveniences, not something you want mid-demo.
    # Set FLASK_DEBUG=1 for local development.
    debug = os.environ.get("FLASK_DEBUG") == "1"
    # Port 5000 is claimed by macOS AirPlay Receiver on most Macs by default,
    # which silently breaks the server before it even starts. 5050 avoids it.
    port = int(os.environ.get("PORT", 5050))
    app.run(debug=debug, host="0.0.0.0", port=port)
