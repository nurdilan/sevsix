/**
 * Uji kondisi "database belum tersambung" (penyebab error 500 di Vercel).
 * Semua variabel koneksi dihapus sebelum modul dimuat.
 */

import { createServer } from 'node:http';
import { once } from 'node:events';

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;
delete process.env.DATABASE_URL_UNPOOLED;
delete process.env.POSTGRES_URL_NON_POOLING;
delete process.env.NEON_DATABASE_URL;
delete process.env.STORAGE_DATABASE_URL;
delete process.env.SEVSIX_DB;
delete process.env.BLOB_READ_WRITE_TOKEN;

const { default: handler } = await import('../api/index.js');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const rest = url.pathname.slice('/api/'.length);
    req.url = `/api?__path=${encodeURIComponent(rest)}`;
  }
  try {
    await handler(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: String(error) }));
  }
});

server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

let failed = 0;
function check(name, condition, detail = '') {
  console.log(`${condition ? 'LULUS' : 'GAGAL'}  ${name}${detail ? ` (${detail})` : ''}`);
  if (!condition) failed += 1;
}

try {
  const health = await fetch(`${base}/api/health`);
  const healthData = await health.json();
  check('GET /health tetap 200 walau DB belum ada', health.status === 200);
  check('health melaporkan DB belum dikonfigurasi', healthData.database && healthData.database.configured === false);
  check('health menyebut driver pg', healthData.database && healthData.database.driver === 'pg');
  check('health melaporkan koneksi gagal', healthData.database && healthData.database.connection.ok === false);

  const content = await fetch(`${base}/api/content`);
  const contentData = await content.json();
  check('GET /content memberi 503 (bukan 500)', content.status === 503, `status ${content.status}`);
  check(
    'pesan 503 menjelaskan cara memperbaiki',
    typeof contentData.error === 'string' && contentData.error.includes('Postgres'),
    contentData.error,
  );
} finally {
  server.close();
}

console.log(failed ? `\n${failed} uji gagal` : '\nSemua uji kondisi tanpa database lulus');
process.exitCode = failed ? 1 : 0;
