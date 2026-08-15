import logging
import os
import uuid
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask.logging import has_level_handler
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from werkzeug.utils import secure_filename

import db
from ai_vision import verify_submission
from quests import generate_quest

load_dotenv()

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


@app.post("/api/users")
def get_or_create_user():
    data = request.get_json(force=True)
    username = (data.get("username") or "").strip()
    if not username:
        return jsonify({"error": "username is required"}), 400

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


@app.post("/api/quests/new")
def create_quest():
    data = request.get_json(force=True)
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400

    conn = db.get_db()
    conn.execute(
        "UPDATE quests SET status = 'abandoned' WHERE user_id = ? AND status = 'active'",
        (user_id,),
    )

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
        "INSERT INTO submissions (quest_id, image_filename, verified, facts) "
        "VALUES (?, ?, ?, ?)",
        (quest_id, filename, int(result["matches"]), result["facts"]),
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
