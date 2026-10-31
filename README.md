# DADUGO INTELLIGENCE

Starter aplikasi dashboard simulasi roll dadu Telegram. Backend Express + Supabase PostgreSQL, autentikasi cookie JWT, webhook Telegram, dashboard statistik historis, dan poin virtual.

## Fitur yang sudah disiapkan
- Registrasi/login/logout dengan hash password bcrypt dan cookie HttpOnly.
- Dashboard statistik dari data ronde sungguhan di database (bukan angka demo).
- Webhook Telegram dengan pemeriksaan `X-Telegram-Bot-Api-Secret-Token`.
- Mengumpulkan 3 pesan emoji 🎲 dari grup yang ditentukan menjadi satu ronde M1–M3.
- Riwayat ronde, aktivitas, leaderboard, bonus poin harian.
- Panel admin dasar: daftar pengguna dan pengumuman.
- UI responsif dan refresh data otomatis setiap 10 detik.

## Prasyarat
Node.js 20+, akun Supabase, bot Telegram yang sudah ditambahkan ke grup, dan URL HTTPS publik untuk webhook.

## Instalasi
1. Buat project di Supabase.
2. Buka SQL Editor dan jalankan `supabase/schema.sql`.
3. Salin `.env.example` menjadi `.env`, lalu isi kredensial.
4. Jangan pernah menaruh `SUPABASE_SERVICE_ROLE_KEY`, token bot, atau JWT secret di frontend/repository publik.
5. Jalankan:
   ```bash
   npm install
   npm start
   ```
6. Buka `http://localhost:3000`.

## Jadikan akun admin
Daftar akun melalui website. Di Supabase SQL Editor, jalankan:
```sql
update public.users set role='admin' where username='USERNAME_ANDA';
```
Gunakan password kuat dan jangan bagikan akses admin.

## Menghubungkan Telegram webhook
Pastikan aplikasi sudah tersedia melalui HTTPS publik. Atur `APP_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, dan `TELEGRAM_CHAT_ID` di `.env`.

Daftarkan webhook (ganti nilai placeholder):
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=<APP_URL>/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  -d 'allowed_updates=["message"]'
```
Bot harus dapat menerima pesan dadu di grup. Untuk mode privasi bot, periksa pengaturan BotFather dan izin grup. `TELEGRAM_CHAT_ID` harus ID grup yang benar.

**Format ronde saat ini:** admin mengirim tepat tiga pesan emoji 🎲 terpisah di grup; tiga event belum terpakai berikutnya menjadi M1, M2, M3. Nilai total 3–10 diklasifikasikan Kecil (K), 11–18 Besar (B). Jika aturan permainan yang dipakai berbeda, ubah batas klasifikasi di `server.js`.

## Catatan penting
- Ini adalah sistem simulasi poin; tidak ada deposit, taruhan uang asli, atau penarikan.
- Statistik dan persentase hanya dihitung dari ronde yang tersimpan. Sampel kosong ditampilkan sebagai 0% dan analisis belum cukup data.
- Persentase historis bukan peluang pasti untuk ronde berikutnya. Dadu Telegram bersifat acak; tidak ada cara yang dapat menjamin prediksi.
- Endpoint admin dasar sudah tersedia, tetapi fitur edit/hapus akun, reset poin massal, audit lanjutan, dan manajemen webhook dari UI belum dibuat.
- Webhook memakai secret token Telegram dan membatasi chat ID. Tambahkan reverse proxy HTTPS, backup database, monitoring, dan kebijakan privasi sebelum produksi.
- Untuk menghindari ronde tercampur, gunakan grup khusus atau pastikan hanya tiga roll per ronde dikirim berurutan. Versi lanjutan sebaiknya menambahkan tombol “mulai ronde/selesai ronde” atau metadata ronde eksplisit.
- Setelah mengisi `.env`, uji register, login, klaim bonus (termasuk klaim kedua yang harus ditolak), akses admin/non-admin, dan webhook dengan tiga pesan dadu nyata.
