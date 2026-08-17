CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    points INTEGER NOT NULL DEFAULT 0,
    quests_completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'plants',
    difficulty TEXT NOT NULL DEFAULT 'easy',
    target_count INTEGER NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    points_reward INTEGER NOT NULL,
    points_per_item INTEGER NOT NULL DEFAULT 10,
    completion_bonus INTEGER NOT NULL DEFAULT 20,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quest_id INTEGER NOT NULL,
    image_filename TEXT NOT NULL,
    image_hash TEXT NOT NULL,
    verified INTEGER NOT NULL,
    facts TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quest_id) REFERENCES quests(id)
);
