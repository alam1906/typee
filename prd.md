# Typee — Product Requirements Document

## Tujuan

Typee adalah website typing test berbahasa Indonesia dengan latihan solo dan race privat yang dapat diikuti lewat tautan. Produk harus nyaman dipakai di desktop maupun ponsel dan ringan untuk VPS kecil.

## Batas MVP

- Latihan solo 60 detik tanpa akun dan tanpa request API selama tes berlangsung.
- Race privat 2–10 pemain, satu teks yang sama, durasi maksimal 60 detik per ronde, host memulai dengan hitung mundur 3 detik.
- Pemain race cukup mengisi nama. Tautan room dapat dibagikan atau dipakai untuk bergabung.
- Lobi menampilkan peserta; race menampilkan progres dan avatar berbeda per pemain. Tiga penyelesai tercepat mendapat emas, perak, perunggu.
- Host dapat mengulang ronde dengan kode room dan peserta yang sama. Poin medali (3/2/1) terakumulasi; host dapat mengakhiri pertandingan untuk menetapkan pemenang dengan poin terbanyak.
- Chat room disimpan hingga room kedaluwarsa. Tidak ada leaderboard global, hadiah, matchmaking, atau akun permanen.

## Arsitektur dan batas beban

- Repositori memakai Bun workspace: `apps/web` untuk frontend statis dan `apps/pocketbase` untuk layanan PocketBase. Skrip integrasi ada di `scripts/` dan menggunakan database uji terpisah.
- Frontend: SvelteKit, TypeScript, `adapter-static` dengan fallback SPA dan CSR. Build dilayani sebagai file statis. Tidak ada server SvelteKit di produksi.
- Solo: teks latihan ada di bundle frontend; hitungan, tampilan karakter, dan hasil berjalan lokal di browser.
- Race: PocketBase menyediakan endpoint untuk membuat room, bergabung, mulai, mengirim progres, dan menyelesaikan race. Collection bawaan tidak menerima penulisan langsung dari publik.
- Progres dikirim maksimal sekali setiap 2 detik jika berubah dan disiarkan melalui custom realtime topic PocketBase. Progres sementara tidak disimpan ke SQLite.
- Penanda avatar memakai jumlah huruf benar dari event progres yang sudah ada, tanpa request atau penulisan tambahan.
- SQLite hanya ditulis saat room/pemain/chat berubah, ronde dimulai atau selesai, dan poin medali diberikan. Progres mengetik tetap tidak ditulis.
- Satu subscription realtime per tab race; dibersihkan saat pengguna meninggalkan halaman.
- Batas room 10 pemain. Room kedaluwarsa 24 jam setelah dibuat atau rematch terakhir dan dibersihkan berkala bersama pemain, chat, dan riwayat ronde.
- Migrasi mengaktifkan rate limit PocketBase. Kapasitas pemain serentak tetap perlu diuji terhadap VPS yang digunakan.

## Alur pengguna

### Solo

1. Pengguna memilih latihan solo dan memfokuskan area ketik.
2. Timer mulai pada ketikan pertama. Browser menghitung WPM, akurasi posisi karakter, dan progres.
3. Tes selesai saat teks sama persis atau 60 detik berlalu. Pengguna dapat mengulang dengan teks berikutnya.

### Race

1. Host mengisi nama dan membuat room. Server membuat kode acak dan identitas sesi tamu.
2. Pemain lain membuka tautan dan bergabung dengan nama. Room menerima paling banyak 10 pemain dan satu slot per identitas browser dalam room.
3. Host memulai setelah minimal 2 pemain hadir. Server menyimpan waktu mulai 3 detik ke depan.
4. Semua pemain mengetik teks yang sama. Browser mengirim progres terbatasi; PocketBase menyiarkan pembaruan ke room.
   Pada multiplayer, karakter salah tetap terlihat dan boleh diedit atau dilanjutkan dalam kata yang sama; spasi menuju kata berikutnya hanya diterima setelah kata saat ini tepat seluruhnya.
5. Browser mengirim teks akhir saat lengkap atau waktu habis. Server menghitung karakter benar, waktu, dan WPM sebelum menyimpan hasil.
6. Server menutup ronde saat 60 detik habis, tiga pemain menyelesaikan teks, atau semua pemain menyelesaikan teks. Medali hanya diberikan kepada penyelesai; hasil tersimpan sekali secara transaksional.
7. Host dapat memulai ronde berikutnya dengan kode yang sama, atau mengakhiri pertandingan. Poin kumulatif ditampilkan sebagai klasemen; poin tertinggi menang, dan poin tertinggi yang seri menjadi juara bersama.

## Data PocketBase

### `rooms`

`code` unik, `passage` teks race, `status` (`waiting`/`running`), `starts_at`, `duration_seconds`, `round_number`, `round_finished_at`, `competition_ended`, `expires_at`. Kode undangan bersifat acak dan tidak boleh dienumerasi melalui collection API.

### `race_players`

`room` relasi, `nickname`, `token_hash` dan `browser_hash` rahasia, `is_host`, `finished_at`, `correct_chars`, `elapsed_ms`, `wpm`, `completed`, `gold_count`, `silver_count`, `bronze_count`, `points`. Satu identitas sesi dibuat per pemain. Endpoint memeriksa token pada aksi yang mengubah state.

### `race_rounds`

Satu record per ronde final berisi `room`, `number`, `gold`, `silver`, `bronze`, dan `ended_at`. Kunci unik `(room, number)` serta transaksi mencegah medali ganda.

### `race_messages`

Pesan chat singkat per room; server hanya mempertahankan 50 pesan terbaru. Relasi room menghapus riwayat saat room kedaluwarsa.

## Aturan penghitungan

- Progres adalah panjang awalan teks yang cocok persis dengan teks target.
- WPM = karakter benar ÷ 5 ÷ menit berjalan; di server, waktu dihitung dari `starts_at`.
- Akurasi tampilan = karakter yang cocok pada posisi yang sama ÷ panjang input saat ini.
- Peraih medali adalah tiga pemain pertama yang menyelesaikan seluruh teks, diurutkan menurut waktu selesai dari server. Pemain yang tidak selesai tidak mendapat medali.
- Hasil bersifat kasual: verifikasi teks akhir mencegah skor hasil yang hanya berupa angka palsu, tetapi tidak mendeteksi bot atau teks yang ditempel.

## Kriteria penerimaan

- `bun run check`, `bun run lint`, dan `bun run build` lulus.
- URL race dinamis dapat dibuka langsung melalui fallback SPA.
- Solo tetap berfungsi ketika PocketBase tidak aktif.
- Dua browser dapat bergabung ke room yang sama, memulai bersama, melihat progres, dan menerima hasil. Browser yang sama tidak dapat mengambil dua slot dalam satu room.
- Rematch mempertahankan kode, pemain, chat, medali, dan poin. Ronde berhenti saat batas waktu atau tiga penyelesai tercapai; akhir pertandingan menampilkan pemenang kumulatif.
- Progress request tidak menghasilkan penulisan record PocketBase.
- Endpoint menolak room penuh, start oleh non-host, token salah, dan hasil sebelum race dimulai.

## Di luar MVP

Akun permanen, leaderboard global, mode ranked, anti-cheat kuat, dan matchmaking publik.
