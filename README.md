# Sevsix — versi Vercel

Versi ini menjalankan Sevsix di Vercel: halaman statis dari folder `public/`, API dalam satu
Vercel Function, data di PostgreSQL, dan foto di Vercel Blob.

## Perbedaan dengan versi Cloudflare

| Bagian | Versi Cloudflare | Versi Vercel |
| --- | --- | --- |
| Server | Cloudflare Worker | Vercel Function (`api/index.js`) |
| Data | D1 (SQLite) | PostgreSQL (Neon / Vercel Postgres) |
| Foto | R2 | Vercel Blob (atau database bila Blob belum ada) |
| Ukuran foto | 6 MB | 4 MB (batas badan permintaan Vercel) |
| Data contoh | otomatis saat pertama dibuka | otomatis saat pertama dibuka |

Data dan foto **tidak berpindah otomatis** antara dua versi ini. Keduanya punya database sendiri.

## Cara memasang di Vercel

1. Masukkan folder ini ke sebuah repositori GitHub (atau jalankan `vercel` dari terminal).
2. Di Vercel: **Add New → Project**, pilih repositori tersebut.
   Framework Preset: **Other**. Root Directory: folder ini. Build Command: kosongkan.
3. **Database:** buka tab **Storage → Create Database → Postgres** (Neon), lalu **Connect**
   ke proyek. Variabel `DATABASE_URL` akan dibuat otomatis.
4. **Foto:** buka **Storage → Create → Blob**, lalu **Connect** ke proyek.
   Variabel `BLOB_READ_WRITE_TOKEN` akan dibuat otomatis.
5. Klik **Deploy** (atau **Redeploy** setelah storage tersambung).
6. Buka domainnya, klik **Admin**, masuk dengan password awal `sevsix2026`, lalu ganti password
   di tab **Password**.

Tanpa langkah 4 situs tetap jalan: foto disimpan di database sebagai teks base64. Cara itu
boros dan lebih lambat, jadi Blob tetap disarankan.

## Struktur file

| File | Fungsi |
| --- | --- |
| `api/index.js` | Semua endpoint `/api/*` (konten, login, CRUD, unggah foto) |
| `lib/db.js` | Koneksi PostgreSQL, pembuatan tabel, pengisian data contoh |
| `lib/storage.js` | Penyimpanan foto: Vercel Blob atau cadangan database |
| `lib/seed.js` | Data contoh kelas 7.6 |
| `public/` | Halaman, CSS, dan JavaScript tampilan |
| `vercel.json` | Mengarahkan semua `/api/*` ke satu fungsi + folder `public` |
| `test/smoke.mjs` | Uji otomatis API memakai PGlite |

## Kalau muncul "Terjadi kesalahan di server"

Buka `https://<domain-anda>/api/health`. Halaman itu menunjukkan:

- `database.configured` — apakah variabel koneksi database ditemukan.
- `database.availableNames` — nama variabel Postgres yang ada di proyek.
- `database.connection.ok` dan `database.connection.error` — hasil percobaan koneksi.
- `blob` — apakah token Vercel Blob terpasang.

Penyebab paling umum:

1. Database sudah dihubungkan tetapi proyek **belum di-redeploy**, sehingga variabel belum
   masuk ke deployment yang berjalan. Klik **Redeploy**.
2. Variabel hanya dipasang untuk lingkungan *Preview*, padahal domain yang dibuka adalah
   *Production*. Centang semua lingkungan (Production, Preview, Development).
3. Nama variabel berbeda. Versi ini membaca `DATABASE_URL`, `POSTGRES_URL`,
   `POSTGRES_PRISMA_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL_NON_POOLING`,
   `NEON_DATABASE_URL`, dan `STORAGE_DATABASE_URL`.

## Menjalankan di komputer

```bash
npm install
npm test          # uji API tanpa akun Vercel (PGlite)
npx vercel dev    # jalankan situs lengkap, butuh login Vercel
```

## Endpoint

- `GET /api/content` — semua isi website
- `GET /api/me` — status login
- `POST /api/login`, `POST /api/logout`, `POST /api/password`
- `PUT /api/settings` — teks beranda
- `POST /api/upload?name=foto.png` — unggah foto (body biner, header `content-type: image/...`)
- `GET /api/file/<id>` — menampilkan foto yang tersimpan di database
- `POST /api/items`, `PUT /api/items/:id`, `DELETE /api/items/:id`

Semua endpoint yang mengubah data memerlukan sesi admin (cookie HttpOnly) dan menolak
permintaan dari alamat lain (pengecekan `Origin`).
