/**
 * Lapisan database Sevsix versi Vercel.
 * - Produksi: PostgreSQL (Neon / Vercel Postgres) lewat DATABASE_URL.
 * - Uji lokal: PGlite (PostgreSQL di dalam Node) lewat SEVSIX_DB=pglite.
 */

import pg from 'pg';

const usePglite = process.env.SEVSIX_DB === 'pglite';

const URL_ENV_NAMES = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
  'NEON_DATABASE_URL',
  'STORAGE_DATABASE_URL',
];

let pool = null;
let pglite = null;
let resolved = null;

/** Cari connection string dari beberapa nama variabel yang biasa dipakai Neon/Vercel. */
export function databaseConfig() {
  if (resolved) return resolved;
  for (const name of URL_ENV_NAMES) {
    const value = process.env[name];
    if (value) {
      resolved = { url: value, source: name };
      return resolved;
    }
  }
  resolved = { url: '', source: '' };
  return resolved;
}

export function databaseStatus() {
  const config = databaseConfig();
  return {
    driver: usePglite ? 'pglite' : 'pg',
    configured: Boolean(config.url),
    source: config.source || null,
    availableNames: URL_ENV_NAMES.filter((name) => Boolean(process.env[name])),
  };
}

export async function checkConnection() {
  try {
    await query('SELECT 1 AS ok');
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error).slice(0, 300) };
  }
}

function sslFor(url) {
  if (/sslmode=disable/i.test(url)) return false;
  if (/localhost|127\.0\.0\.1/i.test(url)) return false;
  return { rejectUnauthorized: false };
}

async function getPglite() {
  if (!pglite) {
    const { PGlite } = await import('@electric-sql/pglite');
    pglite = new PGlite(process.env.SEVSIX_PGLITE_DIR || 'memory://');
  }
  return pglite;
}

export async function query(text, params = []) {
  if (usePglite) {
    const db = await getPglite();
    const result = await db.query(text, params);
    return {
      rows: result.rows || [],
      rowCount: result.affectedRows ?? (result.rows ? result.rows.length : 0),
    };
  }

  const url = databaseConfig().url;
  if (!url) {
    throw new Error(
      `DATABASE_URL belum diatur. Variabel yang dicek: ${URL_ENV_NAMES.join(', ')}. ` +
        'Hubungkan database Postgres ke proyek Vercel lalu Redeploy.',
    );
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      ssl: sslFor(url),
    });
  }
  const result = await pool.query(text, params);
  return { rows: result.rows, rowCount: result.rowCount };
}

/* ------------------------------------------------------------------ */
/* Skema                                                              */
/* ------------------------------------------------------------------ */

let schemaPromise = null;

export function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = initSchema().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      subtitle TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT 0
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS items_kind_sort_idx ON items (kind, sort)');
  await query('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  await query(
    'CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL)',
  );
  await query(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )
  `);

  const counted = await query('SELECT COUNT(*)::int AS n FROM items');
  const total = counted.rows[0] ? Number(counted.rows[0].n) : 0;
  if (total === 0) {
    const { SEED_ITEMS } = await import('./seed.js');
    let index = 0;
    for (const item of SEED_ITEMS) {
      index += 1;
      await query(
        `INSERT INTO items (kind, title, subtitle, body, image, url, meta, sort, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
        [
          item.kind,
          item.title,
          item.subtitle || '',
          item.body || '',
          item.image || '',
          item.url || '',
          JSON.stringify(item.meta || {}),
          index,
          Date.now(),
        ],
      );
    }
  }

  const settingsRow = await query('SELECT COUNT(*)::int AS n FROM settings');
  const settingCount = settingsRow.rows[0] ? Number(settingsRow.rows[0].n) : 0;
  if (settingCount === 0) {
    const { SEED_SETTINGS } = await import('./seed.js');
    for (const [key, value] of Object.entries(SEED_SETTINGS)) {
      await query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, value]);
    }
  }
}
