/**
 * Penyimpanan foto Sevsix versi Vercel.
 * - Jika BLOB_READ_WRITE_TOKEN tersedia: foto disimpan di Vercel Blob (disarankan).
 * - Jika tidak: foto disimpan di tabel `files` dalam database (base64), tetap bisa dipakai.
 */

import { randomBytes } from 'node:crypto';
import { query } from './db.js';

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function isImageType(contentType) {
  return Boolean(EXTENSIONS[contentType]);
}

export function usingBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function safeName(filename, contentType) {
  const ext = EXTENSIONS[contentType] || 'jpg';
  const base = String(filename || 'foto')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'foto'}-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${ext}`;
}

export async function saveImage(buffer, { filename, contentType }) {
  const name = safeName(filename, contentType);

  if (usingBlob()) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`sevsix/${name}`, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
    });
    return blob.url;
  }

  const id = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`;
  await query('INSERT INTO files (id, content_type, data_base64, created_at) VALUES ($1, $2, $3, $4)', [
    id,
    contentType,
    buffer.toString('base64'),
    Date.now(),
  ]);
  return `/api/file/${id}`;
}

export async function readStoredFile(id) {
  const result = await query('SELECT content_type, data_base64 FROM files WHERE id = $1', [id]);
  const row = result.rows[0];
  if (!row) return null;
  return { contentType: row.content_type, buffer: Buffer.from(row.data_base64, 'base64') };
}

export async function deleteImage(imageUrl) {
  const url = String(imageUrl || '');
  if (!url) return;

  if (url.startsWith('/api/file/')) {
    const id = url.slice('/api/file/'.length);
    try {
      await query('DELETE FROM files WHERE id = $1', [id]);
    } catch (error) {
      console.error('Gagal menghapus file dari database:', error);
    }
    return;
  }

  if (/^https?:\/\//i.test(url) && usingBlob()) {
    try {
      const { del } = await import('@vercel/blob');
      await del(url);
    } catch (error) {
      console.error('Gagal menghapus file dari Vercel Blob:', error);
    }
  }
}
