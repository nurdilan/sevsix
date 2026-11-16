/**
 * SEVSIX versi Vercel — satu fungsi untuk semua endpoint /api/*.
 * Routing diatur lewat vercel.json: /api/... -> /api?__path=...
 */

import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { query, ensureSchema, databaseStatus, checkConnection } from '../lib/db.js';
import { saveImage, readStoredFile, deleteImage, isImageType } from '../lib/storage.js';

const KINDS = ['structure', 'gallery', 'duty', 'lesson', 'link'];
const COOKIE_NAME = 'sevsix_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PASSWORD = 'sevsix2026';
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const PBKDF2_ITERATIONS = 100000;
const SETTING_KEYS = ['hero_title', 'hero_tagline', 'hero_desc', 'class_name', 'school', 'footer_note'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default async function handler(req, res) {
  try {
    const url = requestUrl(req);
    const segments = resolveSegments(url);

    if (segments[0] === 'health' && segments.length === 1) {
      return sendJson(res, {
        ok: true,
        version: 'vercel-1.1.0',
        time: new Date().toISOString(),
        database: { ...databaseStatus(), connection: await checkConnection() },
        blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      });
    }

    await ensureSchema();
    await ensureDefaultPassword();

    await route(req, res, url, segments);
  } catch (error) {
    if (error instanceof HttpError) {
      return sendJson(res, { error: error.message }, error.status);
    }
    const message = String((error && error.message) || '');
    if (message.includes('DATABASE_URL')) {
      console.error('Database belum terhubung:', message);
      return sendJson(
        res,
        {
          error:
            'Database belum terhubung. Buka dashboard Vercel -> Storage -> Postgres, lalu Connect ke proyek ini dan Redeploy.',
        },
        503,
      );
    }
    console.error('API error:', error);
    sendJson(res, { error: 'Terjadi kesalahan di server.', hint: 'Buka /api/health untuk melihat penyebabnya.' }, 500);
  }
}

/* ------------------------------------------------------------------ */
/* Router                                                             */
/* ------------------------------------------------------------------ */

async function route(req, res, url, segments) {
  const method = (req.method || 'GET').toUpperCase();
  const [first, second] = segments;

  if (!first) throw new HttpError(404, 'Endpoint tidak ditemukan.');

  if (first === 'content' && !second && method === 'GET') {
    return sendJson(res, await getContent());
  }

  if (first === 'me' && !second && method === 'GET') {
    const session = await getSession(req);
    return sendJson(res, { authenticated: Boolean(session) });
  }

  if (first === 'login' && !second && method === 'POST') {
    return login(req, res);
  }

  if (first === 'logout' && !second && method === 'POST') {
    assertSameOrigin(req);
    const session = await getSession(req);
    if (session) await query('DELETE FROM sessions WHERE token = $1', [session.token]);
    return sendJson(res, { ok: true }, 200, { 'set-cookie': cookieHeader('', 0) });
  }

  if (first === 'password' && !second && method === 'POST') {
    assertSameOrigin(req);
    const session = await requireAdmin(req);
    const body = await readJson(req);
    const current = String(body.current || '');
    const next = String(body.next || '');
    if (next.length < 6) throw new HttpError(400, 'Password baru minimal 6 karakter.');
    if (!(await verifyPassword(current))) throw new HttpError(400, 'Password saat ini salah.');
    await setPassword(next);
    await query('DELETE FROM sessions WHERE token <> $1', [session.token]);
    return sendJson(res, { ok: true });
  }

  if (first === 'settings' && !second && method === 'PUT') {
    assertSameOrigin(req);
    await requireAdmin(req);
    const body = await readJson(req);
    for (const key of SETTING_KEYS) {
      if (typeof body[key] !== 'string') continue;
      await query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [key, body[key].slice(0, 2000)],
      );
    }
    return sendJson(res, { ok: true });
  }

  if (first === 'upload' && !second && method === 'POST') {
    assertSameOrigin(req);
    await requireAdmin(req);
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!isImageType(contentType)) {
      throw new HttpError(400, 'Hanya file gambar JPG, PNG, WEBP, atau GIF yang boleh diunggah.');
    }
    const buffer = await readBody(req, MAX_UPLOAD_BYTES + 1024);
    if (!buffer.length) throw new HttpError(400, 'File kosong.');
    if (buffer.length > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Ukuran foto maksimal 4 MB.');
    const imageUrl = await saveImage(buffer, {
      filename: url.searchParams.get('name') || 'foto',
      contentType,
    });
    return sendJson(res, { ok: true, url: imageUrl }, 201);
  }

  if (first === 'file' && second && (method === 'GET' || method === 'HEAD')) {
    const stored = await readStoredFile(second);
    if (!stored) return sendJson(res, { error: 'Foto tidak ditemukan.' }, 404);
    res.statusCode = 200;
    res.setHeader('content-type', stored.contentType);
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    return res.end(method === 'HEAD' ? undefined : stored.buffer);
  }

  if (first === 'gallery' && second === 'zip' && (method === 'GET' || method === 'HEAD')) {
    return downloadGalleryZip(res);
  }

  if (
    first === 'gallery' &&
    segments.length === 3 &&
    segments[2] === 'download' &&
    (method === 'GET' || method === 'HEAD')
  ) {
    return downloadGalleryPhoto(res, Number(second), method === 'HEAD');
  }

  if (first === 'items' && second === 'bulk' && method === 'POST') {
    assertSameOrigin(req);
    await requireAdmin(req);
    const body = await readJson(req);
    const kind = String(body.kind || '');
    if (!KINDS.includes(kind)) throw new HttpError(400, 'Jenis data tidak dikenal.');
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 500) : [];
    if (!rows.length) throw new HttpError(400, 'Tidak ada baris yang bisa diimpor.');

    if (body.replace) {
      const existing = await query('SELECT image FROM items WHERE kind = $1', [kind]);
      for (const row of existing.rows) {
        if (row.image) await deleteImage(row.image);
      }
      await query('DELETE FROM items WHERE kind = $1', [kind]);
    }

    const maxRow = await query('SELECT COALESCE(MAX(sort), 0)::int AS m FROM items WHERE kind = $1', [kind]);
    let sort = maxRow.rows[0] ? Number(maxRow.rows[0].m) || 0 : 0;
    let created = 0;
    let skipped = 0;
    for (const raw of rows) {
      let item;
      try {
        item = normalizeItem({ ...raw, kind }, true);
      } catch {
        skipped += 1;
        continue;
      }
      sort += 1;
      created += 1;
      await query(
        `INSERT INTO items (kind, title, subtitle, body, image, url, meta, sort, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
        [kind, item.title, item.subtitle, item.body, item.image, item.url, item.meta, sort, Date.now()],
      );
    }
    return sendJson(res, { ok: true, created, skipped }, 201);
  }

  if (first === 'items' && !second && method === 'POST') {
    assertSameOrigin(req);
    await requireAdmin(req);
    const body = await readJson(req);
    const item = normalizeItem(body, true);
    const maxRow = await query('SELECT COALESCE(MAX(sort), 0)::int AS m FROM items WHERE kind = $1', [item.kind]);
    const sort = maxRow.rows[0] ? Number(maxRow.rows[0].m) + 1 : 1;
    const inserted = await query(
      `INSERT INTO items (kind, title, subtitle, body, image, url, meta, sort, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) RETURNING *`,
      [item.kind, item.title, item.subtitle, item.body, item.image, item.url, item.meta, sort, Date.now()],
    );
    return sendJson(res, { ok: true, item: toItem(inserted.rows[0]) }, 201);
  }

  if (first === 'items' && second && (method === 'PUT' || method === 'DELETE')) {
    const id = Number(second);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Data tidak ditemukan.');
    assertSameOrigin(req);
    await requireAdmin(req);

    const existingResult = await query('SELECT * FROM items WHERE id = $1', [id]);
    const existing = existingResult.rows[0];
    if (!existing) throw new HttpError(404, 'Data tidak ditemukan.');

    if (method === 'DELETE') {
      await query('DELETE FROM items WHERE id = $1', [id]);
      if (existing.image) await deleteImage(existing.image);
      return sendJson(res, { ok: true });
    }

    const body = await readJson(req);
    const item = normalizeItem({ ...toItem(existing), ...body, kind: existing.kind }, false);
    const updated = await query(
      `UPDATE items SET title = $1, subtitle = $2, body = $3, image = $4, url = $5, meta = $6::jsonb, sort = $7
       WHERE id = $8 RETURNING *`,
      [item.title, item.subtitle, item.body, item.image, item.url, item.meta, item.sort, id],
    );
    if (existing.image && existing.image !== item.image) await deleteImage(existing.image);
    return sendJson(res, { ok: true, item: toItem(updated.rows[0]) });
  }

  throw new HttpError(404, 'Endpoint tidak ditemukan.');
}

/* ------------------------------------------------------------------ */
/* Konten                                                             */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Unduh foto galeri (resolusi asli)                                  */
/* ------------------------------------------------------------------ */

const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_ZIP_BYTES = 80 * 1024 * 1024;

function downloadName(title, contentType, fallback) {
  const base = String(title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || `foto-${fallback}`}.${EXT_BY_TYPE[contentType] || 'jpg'}`;
}

async function readGalleryImage(image) {
  const value = String(image || '');
  if (value.startsWith('/api/file/')) {
    const stored = await readStoredFile(value.slice('/api/file/'.length));
    if (!stored) return null;
    return { buffer: stored.buffer, contentType: stored.contentType };
  }
  if (/^https?:\/\//i.test(value)) {
    const response = await fetch(value);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return { buffer: Buffer.from(await response.arrayBuffer()), contentType };
  }
  return null;
}

async function downloadGalleryPhoto(res, id, headOnly) {
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Foto tidak ditemukan.');
  const result = await query("SELECT * FROM items WHERE id = $1 AND kind = 'gallery'", [id]);
  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'Foto tidak ditemukan.');
  const file = await readGalleryImage(row.image);
  if (!file) throw new HttpError(404, 'Foto ini tidak punya file yang bisa diunduh.');
  const filename = downloadName(row.title, file.contentType, id);
  res.statusCode = 200;
  res.setHeader('content-type', file.contentType);
  res.setHeader(
    'content-disposition',
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  res.setHeader('content-length', String(file.buffer.length));
  res.setHeader('cache-control', 'private, max-age=0, must-revalidate');
  res.end(headOnly ? undefined : file.buffer);
}

async function downloadGalleryZip(res) {
  const result = await query("SELECT * FROM items WHERE kind = 'gallery' ORDER BY sort ASC, id ASC");
  const entries = [];
  const used = new Set();
  let total = 0;

  for (const row of result.rows) {
    const file = await readGalleryImage(row.image);
    if (!file) continue;
    total += file.buffer.length;
    if (total > MAX_ZIP_BYTES) {
      throw new HttpError(413, 'Total foto terlalu besar untuk diunduh sekaligus. Unduh satu per satu ya.');
    }
    let name = downloadName(row.title, file.contentType, row.id);
    if (used.has(name)) {
      const dot = name.lastIndexOf('.');
      const base = name.slice(0, dot);
      const ext = name.slice(dot);
      let n = 2;
      while (used.has(`${base}-${n}${ext}`)) n += 1;
      name = `${base}-${n}${ext}`;
    }
    used.add(name);
    entries.push({ name, data: file.buffer });
  }

  if (!entries.length) throw new HttpError(404, 'Belum ada foto yang bisa diunduh.');

  const zip = buildZip(entries);
  res.statusCode = 200;
  res.setHeader('content-type', 'application/zip');
  res.setHeader('content-disposition', 'attachment; filename="galeri-sevsix.zip"');
  res.setHeader('content-length', String(zip.length));
  res.end(zip);
}

let crcTable = null;

function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP tanpa kompresi (method store) supaya isi foto tetap resolusi asli. */
function buildZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf8');
    const size = file.data.length;
    const crc = crc32(file.data);

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);
    parts.push(local, file.data);

    const entry = Buffer.alloc(46 + nameBytes.length);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(size, 20);
    entry.writeUInt32LE(size, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    nameBytes.copy(entry, 46);
    central.push(entry);

    offset += local.length + size;
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...parts, ...central, end]);
}

async function getContent() {
  const itemsResult = await query('SELECT * FROM items ORDER BY sort ASC, id ASC');
  const settingsResult = await query('SELECT key, value FROM settings');

  const items = { structure: [], gallery: [], duty: [], lesson: [], link: [] };
  for (const row of itemsResult.rows) {
    if (!items[row.kind]) items[row.kind] = [];
    items[row.kind].push(toItem(row));
  }

  const settings = {};
  for (const row of settingsResult.rows) {
    if (row.key !== 'admin_password') settings[row.key] = row.value;
  }

  return { items, settings, days: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] };
}

function toItem(row) {
  let meta = row.meta;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    subtitle: row.subtitle,
    body: row.body,
    image: row.image,
    url: row.url,
    meta: meta && typeof meta === 'object' ? meta : {},
    sort: Number(row.sort) || 0,
  };
}

function normalizeItem(input, creating) {
  const kind = String(input.kind || '');
  if (!KINDS.includes(kind)) throw new HttpError(400, 'Jenis data tidak dikenal.');
  const title = String(input.title || '').trim().slice(0, 200);
  if (!title) throw new HttpError(400, 'Judul/nama wajib diisi.');

  const metaInput = input.meta && typeof input.meta === 'object' ? input.meta : {};
  const meta = {};
  for (const key of Object.keys(metaInput).slice(0, 10)) {
    meta[key] = String(metaInput[key] ?? '').slice(0, 200);
  }

  return {
    kind,
    title,
    subtitle: String(input.subtitle || '').trim().slice(0, 200),
    body: String(input.body || '').trim().slice(0, 2000),
    image: String(input.image || '').trim().slice(0, 1000),
    url: String(input.url || '').trim().slice(0, 1000),
    meta: JSON.stringify(meta),
    sort: creating ? 1 : Math.max(1, Number(input.sort) || 1),
  };
}

/* ------------------------------------------------------------------ */
/* Autentikasi                                                        */
/* ------------------------------------------------------------------ */

const loginAttempts = new Map();

async function login(req, res) {
  assertSameOrigin(req);
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'local';
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (attempt && now - attempt.since < 10 * 60 * 1000 && attempt.count >= 10) {
    throw new HttpError(429, 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.');
  }

  const body = await readJson(req);
  const password = String(body.password || '');
  const ok = await verifyPassword(password);

  if (!ok) {
    const next =
      attempt && now - attempt.since < 10 * 60 * 1000
        ? { ...attempt, count: attempt.count + 1 }
        : { count: 1, since: now };
    loginAttempts.set(ip, next);
    throw new HttpError(401, 'Password salah.');
  }

  loginAttempts.delete(ip);
  const token = randomBytes(32).toString('hex');
  await query('INSERT INTO sessions (token, created_at, expires_at) VALUES ($1, $2, $3)', [
    token,
    now,
    now + SESSION_TTL_MS,
  ]);
  await query('DELETE FROM sessions WHERE expires_at < $1', [now]);

  return sendJson(res, { ok: true }, 200, { 'set-cookie': cookieHeader(token, Math.floor(SESSION_TTL_MS / 1000)) });
}

function cookieHeader(value, maxAgeSeconds) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function parseCookies(header) {
  const out = {};
  String(header || '')
    .split(';')
    .forEach((part) => {
      const index = part.indexOf('=');
      if (index === -1) return;
      out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    });
  return out;
}

async function getSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;
  const result = await query('SELECT token, expires_at FROM sessions WHERE token = $1', [token]);
  const row = result.rows[0];
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) {
    await query('DELETE FROM sessions WHERE token = $1', [token]);
    return null;
  }
  return row;
}

async function requireAdmin(req) {
  const session = await getSession(req);
  if (!session) throw new HttpError(401, 'Silakan masuk sebagai admin.');
  return session;
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'Permintaan ditolak.');
  }
  if (!host || originHost !== host) throw new HttpError(403, 'Permintaan ditolak.');
}

/* ------------------------------------------------------------------ */
/* Password                                                           */
/* ------------------------------------------------------------------ */

let passwordChecked = false;

async function ensureDefaultPassword() {
  if (passwordChecked) return;
  const result = await query("SELECT value FROM settings WHERE key = 'admin_password'");
  if (!result.rows[0]) await setPassword(DEFAULT_PASSWORD);
  passwordChecked = true;
}

function hashPassword(password, saltHex) {
  return pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
}

async function setPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const value = JSON.stringify({ salt, hash: hashPassword(password, salt), iterations: PBKDF2_ITERATIONS });
  await query(
    "INSERT INTO settings (key, value) VALUES ('admin_password', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [value],
  );
}

async function verifyPassword(password) {
  if (!password) return false;
  const result = await query("SELECT value FROM settings WHERE key = 'admin_password'");
  const row = result.rows[0];
  if (!row || !row.value) return false;
  let stored;
  try {
    stored = JSON.parse(row.value);
  } catch {
    return false;
  }
  if (!stored.salt || !stored.hash) return false;
  const hash = hashPassword(password, stored.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(stored.hash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/* Utilitas                                                           */
/* ------------------------------------------------------------------ */

function requestUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  try {
    return new URL(req.url || '/', `https://${host}`);
  } catch {
    return new URL('/api', 'https://localhost');
  }
}

function resolveSegments(url) {
  const fromRewrite = url.searchParams.get('__path');
  const raw = fromRewrite !== null ? fromRewrite : url.pathname.replace(/^\/api\/?/, '');
  return String(raw || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
}

async function readBody(req, limit) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        reject(new HttpError(413, 'Ukuran data terlalu besar.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks));
    });
    req.on('error', (error) => {
      if (!failed) reject(error);
    });
  });
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const buffer = await readBody(req, 512 * 1024);
  if (!buffer.length) return {};
  try {
    const parsed = JSON.parse(buffer.toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new HttpError(400, 'Format data tidak valid.');
  }
}

function sendJson(res, data, status = 200, headers = {}) {
  const body = JSON.stringify(data);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(body);
}
