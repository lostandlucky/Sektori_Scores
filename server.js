const path = require("path");
const express = require("express");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const EDIT_KEY = process.env.EDIT_KEY || "";
const DATABASE_URL = process.env.DATABASE_URL || "";

const CATEGORIES = [
  { id: "classic", label: "Classic", group: "Arcade", order: 1 },
  { id: "gates", label: "Gates", group: "Arcade", order: 2 },
  { id: "assault", label: "Assault", group: "Arcade", order: 3 },
  { id: "surge", label: "Surge", group: "Arcade", order: 4 },
  { id: "crash", label: "Crash", group: "Arcade", order: 5 },
  { id: "boss_rush", label: "Boss Rush", group: "Arcade", order: 6 },
  { id: "campaign_experience_ship_a", label: "Experience - Defier", group: "Campaign", order: 7 },
  { id: "campaign_experience_ship_b", label: "Experience - Redeemer", group: "Campaign", order: 8 },
  { id: "campaign_experience_ship_c", label: "Experience - Sentinel", group: "Campaign", order: 9 },
  { id: "campaign_challenge_ship_a", label: "Challenge - Defier", group: "Campaign", order: 10 },
  { id: "campaign_challenge_ship_b", label: "Challenge - Redeemer", group: "Campaign", order: 11 },
  { id: "campaign_challenge_ship_c", label: "Challenge - Sentinel", group: "Campaign", order: 12 },
  { id: "campaign_revolution_ship_a", label: "Revolution - Defier", group: "Campaign", order: 13 },
  { id: "campaign_revolution_ship_b", label: "Revolution - Redeemer", group: "Campaign", order: 14 },
  { id: "campaign_revolution_ship_c", label: "Revolution - Sentinel", group: "Campaign", order: 15 }
];

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

if (!DATABASE_URL) {
  console.warn("DATABASE_URL is not set. The server will fail to connect to Postgres.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : undefined
});

pool.on("error", (err) => {
  console.error("Unexpected Postgres client error:", err);
});

function isEditAuthorized(req) {
  if (!EDIT_KEY) return true;
  const key = (req.query.key || req.get("x-edit-key") || "").toString();
  return key === EDIT_KEY;
}

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        group_name TEXT NOT NULL,
        sort_order INT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS scores (
        category_id TEXT PRIMARY KEY REFERENCES categories(id) ON DELETE CASCADE,
        jared_score INT NOT NULL DEFAULT 0,
        steve_score INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS history (
        id BIGSERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        player TEXT NOT NULL CHECK (player IN ('jared','steve')),
        score INT NOT NULL,
        previous_score INT NOT NULL,
        source_ip TEXT
      )
    `);
    await client.query("CREATE INDEX IF NOT EXISTS history_category_timestamp_idx ON history (category_id, timestamp DESC)");
    await client.query("CREATE INDEX IF NOT EXISTS history_timestamp_idx ON history (timestamp DESC)");

    for (const category of CATEGORIES) {
      await client.query(
        `
          INSERT INTO categories (id, label, group_name, sort_order)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id) DO UPDATE SET
            label = EXCLUDED.label,
            group_name = EXCLUDED.group_name,
            sort_order = EXCLUDED.sort_order
        `,
        [category.id, category.label, category.group, category.order]
      );

      await client.query(
        `
          INSERT INTO scores (category_id, jared_score, steve_score)
          VALUES ($1, 0, 0)
          ON CONFLICT (category_id) DO NOTHING
        `,
        [category.id]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function fetchCategories() {
  const { rows } = await pool.query(
    "SELECT id, label, group_name, sort_order FROM categories ORDER BY sort_order ASC"
  );
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    group: row.group_name,
    order: row.sort_order
  }));
}

async function fetchScores() {
  const { rows } = await pool.query("SELECT category_id, jared_score, steve_score, updated_at FROM scores");
  const scores = {};
  for (const row of rows) {
    scores[row.category_id] = {
      jared: row.jared_score,
      steve: row.steve_score,
      updatedAt: row.updated_at.toISOString()
    };
  }
  return scores;
}

async function fetchMetaUpdatedAt() {
  const { rows } = await pool.query("SELECT MAX(updated_at) AS updated_at FROM scores");
  const updatedAt = rows[0]?.updated_at ? rows[0].updated_at.toISOString() : new Date().toISOString();
  return { updatedAt };
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json({ limit: "5kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/healthz", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: "db_unavailable" });
  }
});

app.get("/", async (req, res) => {
  const key = (req.query.key || "").toString();
  const [categories, scores] = await Promise.all([fetchCategories(), fetchScores()]);
  const initialData = { categories, scores };
  res.render("index", {
    initialData,
    editKey: EDIT_KEY ? key : "",
    categories,
    scores
  });
});

app.get("/api/scores", async (req, res) => {
  const [meta, categories, scores] = await Promise.all([
    fetchMetaUpdatedAt(),
    fetchCategories(),
    fetchScores()
  ]);
  res.json({ meta, categories, scores });
});

app.get("/api/history", async (req, res) => {
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(0, Math.min(limitRaw, 1000)) : 100;
  const { rows } = await pool.query(
    `
      SELECT timestamp, category_id, player, score, previous_score, source_ip
      FROM history
      ORDER BY timestamp DESC
      LIMIT $1
    `,
    [limit]
  );
  res.json({
    history: rows.map((row) => ({
      timestamp: row.timestamp.toISOString(),
      categoryId: row.category_id,
      player: row.player,
      score: row.score,
      previousScore: row.previous_score,
      sourceIp: row.source_ip
    }))
  });
});

app.post("/api/score", async (req, res) => {
  if (!isEditAuthorized(req)) {
    return res.status(403).json({ ok: false, error: "Invalid edit key" });
  }

  const playerRaw = (req.body.player || "").toString().trim().toLowerCase();
  const categoryId = (req.body.categoryId || "").toString().trim();
  const scoreRaw = req.body.score;

  if (playerRaw !== "jared" && playerRaw !== "steve") {
    return res.status(400).json({ ok: false, error: "Invalid player" });
  }

  if (!CATEGORY_IDS.has(categoryId)) {
    return res.status(400).json({ ok: false, error: "Invalid categoryId" });
  }

  const score = Number(scoreRaw);
  if (!Number.isInteger(score) || score < 0 || score > 2147483647) {
    return res.status(400).json({ ok: false, error: "Invalid score" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT jared_score, steve_score FROM scores WHERE category_id = $1 FOR UPDATE",
      [categoryId]
    );

    if (rows.length === 0) {
      await client.query(
        "INSERT INTO scores (category_id, jared_score, steve_score) VALUES ($1, 0, 0)",
        [categoryId]
      );
    }

    const currentRow = rows[0] || { jared_score: 0, steve_score: 0 };
    const previousScore = playerRaw === "jared" ? currentRow.jared_score : currentRow.steve_score;
    const updateSql =
      playerRaw === "jared"
        ? "UPDATE scores SET jared_score = $1, updated_at = NOW() WHERE category_id = $2"
        : "UPDATE scores SET steve_score = $1, updated_at = NOW() WHERE category_id = $2";

    await client.query(updateSql, [score, categoryId]);
    await client.query(
      `
        INSERT INTO history (timestamp, category_id, player, score, previous_score, source_ip)
        VALUES (NOW(), $1, $2, $3, $4, $5)
      `,
      [categoryId, playerRaw, score, previousScore, req.ip]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      updatedAt: new Date().toISOString(),
      categoryId,
      player: playerRaw,
      score
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to update score:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  } finally {
    client.release();
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
