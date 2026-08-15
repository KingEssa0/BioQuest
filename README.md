# BioQuest
A fun, educational game about nature. Built for Oregon Hackathon 2026

Players get a random nature quest (e.g. "find 3 different trees"), go outside,
take photos, and submit them. Claude verifies the photo, shares facts about
what's in it, and awards points. Climb the leaderboard by completing quests.

## Team
- **Backend** (Flask API, SQLite, Claude vision integration) — `backend/`
- **JS logic** (quest flow, camera capture, API calls) — `frontend/js/`
- **HTML/CSS** (layout, styling) — `frontend/index.html`, `frontend/css/`

## Running it

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your ANTHROPIC_API_KEY
python app.py
```

Then open http://localhost:5050 — Flask serves the frontend directly, so
there's only one server to run. The SQLite database (`backend/bioquest.db`)
is created automatically on first run.

## Demo day

Run `./demo.sh` from the repo root — it starts the backend and a public
HTTPS URL (via a Cloudflare tunnel) in one command, so any phone can reach
it regardless of venue wifi. Ctrl+C stops everything. Prints both the local
and public URL.

## API

| Endpoint | Method | Description |
|---|---|---|
| `/api/users` | POST | Get or create a user by username |
| `/api/quests/active?user_id=` | GET | Get the user's current active quest |
| `/api/quests/new` | POST | Assign a new random quest |
| `/api/submit` | POST | Submit a photo (multipart: `quest_id`, `image`) for verification |
| `/api/leaderboard` | GET | Top users by points |
