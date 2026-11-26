/**
 * Uji asap API versi Vercel tanpa akun Vercel:
 * - Database memakai PGlite (PostgreSQL di dalam Node).
 * - Penyimpanan foto memakai cadangan database (tanpa token Blob).
 * Jalankan: npm test
 */

import { createServer } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';

process.env.SEVSIX_DB = 'pglite';
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.DATABASE_URL;

const { default: handler } = await import('../api/index.js');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const rest = url.pathname.slice('/api/'.length);
    const query = url.search ? `&${url.search.slice(1)}` : '';
    req.url = `/api?__path=${encodeURIComponent(rest)}${query}`;
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

let cookie = '';

async function call(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(base + path, { ...options, headers });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const match = /sevsix_session=([^;]*)/.exec(setCookie);
    if (match) cookie = match[1] ? `sevsix_session=${match[1]}` : '';
  }
  const type = response.headers.get('content-type') || '';
  let data = null;
  if (type.includes('application/json')) data = await response.json();
  return { status: response.status, data, type, headers: response.headers };
}

const json = (body, extra = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(extra.headers || {}) },
  body: JSON.stringify(body),
  ...extra,
});

const pngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? 'LULUS' : 'GAGAL'}  ${name}${detail ? ` (${detail})` : ''}`);
  if (!condition) process.exitCode = 1;
}

try {
  // 1. Data awal
  const content = await call('/api/content');
  check('GET /content 200', content.status === 200);
  const totalSeed = Object.values(content.data.items).reduce((sum, list) => sum + list.length, 0);
  check('data contoh terisi (88 baris)', totalSeed === 88, `total ${totalSeed}`);
  check('judul beranda terbaca', content.data.settings.hero_title === 'Sevsix', content.data.settings.hero_title);

  const health = await call('/api/health');
  check('GET /health 200', health.status === 200);
  check(
    'health: database terhubung',
    health.data && health.data.database.driver === 'pglite' && health.data.database.connection.ok === true,
    JSON.stringify(health.data && health.data.database),
  );

  // 2. Belum login
  check('GET /me tanpa sesi = false', content.status === 200 && (await call('/api/me')).data.authenticated === false);

  // 3. Login
  const wrong = await call('/api/login', json({ password: 'salah' }));
  check('login password salah ditolak (401)', wrong.status === 401, wrong.data && wrong.data.error);
  const login = await call('/api/login', json({ password: 'sevsix2026' }));
  check('login password benar (200)', login.status === 200);
  check('sesi aktif setelah login', (await call('/api/me')).data.authenticated === true);

  // 4. Tambah / ubah / hapus
  const created = await call('/api/items', json({ kind: 'link', title: 'Grup Uji', url: 'https://contoh.test', meta: { icon: 'whatsapp' } }));
  check('tambah link (201)', created.status === 201, created.data && created.data.error);
  const newId = created.data && created.data.item && created.data.item.id;
  check('id item baru ada', Number.isInteger(newId));

  const updated = await call(`/api/items/${newId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Grup Uji Diubah', subtitle: 'catatan', url: 'https://contoh.test' }),
  });
  check('ubah link (200)', updated.status === 200 && updated.data.item.title === 'Grup Uji Diubah');

  const emptyTitle = await call('/api/items', json({ kind: 'link', title: '' }));
  check('judul kosong ditolak (400)', emptyTitle.status === 400);

  // 5. Unggah foto (cadangan database)
  const uploaded = await fetch(`${base}/api/upload?name=uji.png`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', cookie },
    body: pngBuffer,
  });
  const uploadData = await uploaded.json();
  check('unggah foto (201)', uploaded.status === 201, uploadData.error || uploadData.url);
  check('foto memakai /api/file (tanpa Blob)', String(uploadData.url || '').startsWith('/api/file/'));

  const served = await fetch(`${base}${uploadData.url}`);
  check('foto bisa dibuka (200 image/png)', served.status === 200 && served.headers.get('content-type') === 'image/png');

  const badType = await fetch(`${base}/api/upload?name=x.txt`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', cookie },
    body: 'halo',
  });
  check('unggahan bukan gambar ditolak (400)', badType.status === 400);

  // 6. Foto ikut terhapus bersama datanya
  const gallery = await call(
    '/api/items',
    json({ kind: 'gallery', title: 'Foto Uji', body: 'tes', image: uploadData.url }),
  );
  check('tambah galeri dengan foto (201)', gallery.status === 201, gallery.data && gallery.data.error);
  const galleryId = gallery.data && gallery.data.item && gallery.data.item.id;

  // 6b. Unduh foto resolusi asli + unduh semua (ZIP)
  const dlRes = await fetch(`${base}/api/gallery/${galleryId}/download`);
  const dlBuf = Buffer.from(await dlRes.arrayBuffer());
  check(
    'unduh foto (200, isi sama persis)',
    dlRes.status === 200 && dlBuf.equals(Buffer.from(pngBuffer)),
    `status ${dlRes.status}, ${dlBuf.length} byte`,
  );
  check(
    'nama file unduhan rapi',
    /attachment; filename="foto-uji\.png"/.test(dlRes.headers.get('content-disposition') || ''),
    dlRes.headers.get('content-disposition'),
  );

  const zipRes = await fetch(`${base}/api/gallery/zip`);
  const zipBuf = Buffer.from(await zipRes.arrayBuffer());
  check('unduh ZIP (200 application/zip)', zipRes.status === 200 && zipRes.headers.get('content-type') === 'application/zip');
  check('ZIP berisi foto uji', zipBuf.includes(Buffer.from('foto-uji.png')), `${zipBuf.length} byte`);

  const missingDl = await fetch(`${base}/api/gallery/999999/download`);
  check('unduh foto yang tidak ada (404)', missingDl.status === 404);

  const removed = await call(`/api/items/${galleryId}`, { method: 'DELETE' });
  check('hapus galeri (200)', removed.status === 200);
  const afterDelete = await fetch(`${base}${uploadData.url}`);
  check('foto ikut terhapus dari penyimpanan (404)', afterDelete.status === 404, `status ${afterDelete.status}`);

  // 7. Keamanan
  const adminCookie = cookie;
  cookie = '';
  const noAuth = await call('/api/items', json({ kind: 'link', title: 'tanpa login' }));
  check('tambah tanpa login ditolak (401)', noAuth.status === 401);
  cookie = adminCookie;

  const foreign = await call('/api/items', json({ kind: 'link', title: 'csrf' }, { headers: { origin: 'https://jahat.example' } }));
  check('permintaan dari situs lain ditolak (403)', foreign.status === 403);

  const sameOrigin = await call('/api/items', json({ kind: 'link', title: 'situs sendiri' }, { headers: { origin: base } }));
  check('permintaan dari situs sendiri diizinkan', sameOrigin.status === 201);
  if (sameOrigin.data && sameOrigin.data.item) await call(`/api/items/${sameOrigin.data.item.id}`, { method: 'DELETE' });

  // 8. Pengaturan beranda
  const settings = await call('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hero_title: 'Sevsix Uji', class_name: '7.6', hero_tagline: 'Kelas 7.6', school: 'SMP', hero_desc: 'tes', footer_note: 'tes' }),
  });
  check('simpan pengaturan beranda (200)', settings.status === 200);
  const afterSettings = await call('/api/content');
  check('judul beranda tersimpan', afterSettings.data.settings.hero_title === 'Sevsix Uji');

  // 9. Password
  const badCurrent = await call('/api/password', json({ current: 'salah', next: 'rahasia456' }));
  check('ganti password dengan password lama salah ditolak (400)', badCurrent.status === 400);
  const shortNext = await call('/api/password', json({ current: 'sevsix2026', next: '123' }));
  check('password baru terlalu pendek ditolak (400)', shortNext.status === 400);
  const changed = await call('/api/password', json({ current: 'sevsix2026', next: 'rahasia456' }));
  check('ganti password berhasil (200)', changed.status === 200);
  const relogin = await call('/api/login', json({ password: 'rahasia456' }));
  check('login dengan password baru berhasil', relogin.status === 200);
  const revert = await call('/api/password', json({ current: 'rahasia456', next: 'sevsix2026' }));
  check('password dikembalikan ke default', revert.status === 200);

  // 9b. Bersihkan item uji
  const deletedLink = await call(`/api/items/${newId}`, { method: 'DELETE' });
  check('hapus link uji (200)', deletedLink.status === 200);

  // 9c. Impor massal (dan pemulihan data asli)
  const structureSnapshot = (await call('/api/content')).data.items.structure.map((item) => ({
    title: item.title,
    subtitle: item.subtitle,
    body: item.body,
    image: item.image,
  }));
  const bulk = await call(
    '/api/items/bulk',
    json({
      kind: 'duty',
      rows: [
        { title: 'Petugas Uji A', meta: { day: 'Senin' } },
        { title: 'Petugas Uji B', meta: { day: 'Selasa' } },
        { title: '', meta: { day: 'Rabu' } },
      ],
    }),
  );
  check('impor massal (201)', bulk.status === 201, bulk.data && bulk.data.error);
  check(
    'impor massal: 2 dibuat, 1 dilewati',
    bulk.data && bulk.data.created === 2 && bulk.data.skipped === 1,
    JSON.stringify(bulk.data),
  );
  const dutyAfterBulk = (await call('/api/content')).data.items.duty.length;
  check('impor massal menambah data', dutyAfterBulk === 41, `total ${dutyAfterBulk}`);

  const replaceBulk = await call(
    '/api/items/bulk',
    json({ kind: 'structure', replace: true, rows: [{ title: 'Sementara', subtitle: 'Uji' }] }),
  );
  const structureAfterReplace = (await call('/api/content')).data.items.structure.length;
  check('impor massal mode ganti', replaceBulk.status === 201 && structureAfterReplace === 1, `total ${structureAfterReplace}`);

  await call('/api/items/bulk', json({ kind: 'structure', replace: true, rows: structureSnapshot }));
  const structureRestored = (await call('/api/content')).data.items.structure.length;
  check('data struktur bisa dipulihkan lewat impor', structureRestored === 9, `total ${structureRestored}`);

  const dutyBulkItems = (await call('/api/content')).data.items.duty.filter((item) => item.title.startsWith('Petugas Uji'));
  for (const item of dutyBulkItems) {
    await call(`/api/items/${item.id}`, { method: 'DELETE' });
  }

  // 10. Logout
  const logout = await call('/api/logout', { method: 'POST' });
  check('logout (200)', logout.status === 200);
  check('sesi berakhir setelah logout', (await call('/api/me')).data.authenticated === false);

  // 11. Data contoh tetap 56 setelah semua uji
  const finalContent = await call('/api/content');
  const finalTotal = Object.values(finalContent.data.items).reduce((sum, list) => sum + list.length, 0);
  check('jumlah data kembali rapi (88)', finalTotal === 88, `total ${finalTotal}`);

  // 12. Rute tidak dikenal
  const missing = await call('/api/tidak-ada');
  check('rute tidak dikenal 404', missing.status === 404);
} finally {
  server.close();
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} uji lulus`);
if (failed.length) {
  console.log('Gagal:', failed.map((item) => item.name).join(', '));
  process.exitCode = 1;
}
