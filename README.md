# Typee

Typing test solo dan race privat realtime. Rincian fitur dan batas MVP ada di [prd.md](./prd.md).

## Jalankan lokal

Proyek ini memakai Bun workspace:

- `apps/web` — SvelteKit SPA/CSR, dibangun menjadi file statis.
- `apps/pocketbase` — binary PocketBase, hooks, migrasi, dan data lokal.
- `scripts` — pengujian integrasi yang memakai database sementara.

PocketBase 0.40.4 untuk macOS arm64 sudah tersedia di `apps/pocketbase/pocketbase`. Pada mesin lain, unduh binary yang sesuai dari [rilis PocketBase](https://github.com/pocketbase/pocketbase/releases), lalu letakkan di lokasi tersebut.

```sh
bun install
bun run dev:all
```

Perintah tersebut menjalankan PocketBase dan SvelteKit bersama. Jika ingin menjalankannya di terminal terpisah, gunakan `bun run pb:dev` dan `bun run dev`.

Website tersedia di `http://localhost:5173`. Vite meneruskan `/api` ke PocketBase pada `127.0.0.1:8090`. Migrasi dan hook PocketBase berjalan otomatis saat server dimulai. Data lokal tersimpan di `apps/pocketbase/pb_data` dan diabaikan oleh Git.

## Pemeriksaan

```sh
bun run check
bun run lint
bun run build
bun run smoke:race
bun run smoke:browser
```

Kedua smoke test menjalankan PocketBase dengan database sementara yang terpisah dan menghapusnya setelah selesai. `smoke:browser` juga menjalankan Vite sementara dan membutuhkan Google Chrome di macOS; server dev lokal tidak perlu dijalankan untuk kedua tes tersebut.

## Deploy dengan GitHub Actions dan Dokploy

Workflow [deploy.yml](./.github/workflows/deploy.yml) berjalan setelah push ke `main` atau secara manual. GitHub Actions memeriksa proyek, membangun **satu image** untuk `amd64` dan `arm64` dari [Dockerfile](./deploy/Dockerfile), lalu mengirimnya ke GitHub Container Registry (GHCR). Image `ghcr.io/alam1906/typee:latest` memuat file statis web, Nginx, binary PocketBase, hooks, dan migrasi. Dokploy hanya menarik serta menjalankan image ini, tanpa membangun kode di VPS. Nginx melayani web pada port `80` dan meneruskan `/api/*` ke PocketBase pada port `8090` dalam container yang sama.

Siapkan **satu Application** di Dokploy dengan Source Type **Docker**:

1. Pada Docker Image isi `ghcr.io/alam1906/typee:latest`, Registry URL `ghcr.io`, dan Username `alam1906`. Jika package GHCR privat, isi Password dengan token GitHub yang memiliki izin `read:packages` dan akses ke package tersebut. Jika publik, Username dan Password boleh dikosongkan. Pengaturan Build Type seperti Nixpacks tidak digunakan oleh source Docker image.
2. Pada tab Advanced → Volumes/Mounts, tambahkan **Volume Mount** bernama `typee-pocketbase-data` dengan Mount Path `/pb/pb_data`. Pastikan volume ini dibuat sebelum deployment pertama. Tanpa volume tersebut, database dan file unggahan tidak akan bertahan saat image diganti.
3. Pada tab Domains, tambahkan domain website dengan Container Port `80` dan domain PocketBase dengan Container Port `8090`. Gunakan Path `/` untuk keduanya dan aktifkan HTTPS. Arahkan DNS kedua domain ke IP VPS sebelum membuat sertifikat. Container Port hanya dipakai Traefik untuk merutekan domain; jangan tambahkan host port di Advanced → Ports. Setelah image baru tersedia, periksa `https://DOMAIN_WEB/health` dan `https://DOMAIN_POCKETBASE/api/health`. Dashboard PocketBase berada di `https://DOMAIN_POCKETBASE/_/`.
4. Untuk deploy otomatis, buat API key Dokploy dan tambahkan GitHub Actions secrets `DOKPLOY_URL` (misalnya `https://dokploy.example.com`), `DOKPLOY_API_KEY`, dan `DOKPLOY_APPLICATION_ID` (ID Application ini). GitHub `GITHUB_TOKEN` otomatis dipakai untuk menulis image ke GHCR. Nonaktifkan auto deploy dari GitHub di Dokploy agar deployment dimulai setelah image selesai dikirim oleh Actions.

Jalankan workflow `Build and deploy` atau push ke `main`. Workflow mengirim tag `latest` dan SHA commit; setelah publish berhasil, workflow memanggil API deploy Application Dokploy. Migrasi PocketBase berjalan saat container mulai. Buat superuser PocketBase pertama melalui terminal container di Dokploy jika diperlukan. Backup volume PocketBase sebelum mengubah migrasi atau versi PocketBase, dan jangan hapus volume tersebut saat redeploy.

Satu container menjalankan dua proses: PocketBase dan Nginx. Jika salah satunya berhenti, container ikut berhenti agar Dokploy dapat me-restart seluruh Application. Trafik web dapat terputus sebentar saat image diganti. Web tetap menggunakan API pada domainnya sendiri melalui `/api`, sehingga domain PocketBase tidak mengubah request frontend. Konfigurasi ini mengasumsikan Traefik Dokploy menjadi satu-satunya pintu masuk dan tidak mempercayai `X-Forwarded-*` dari klien langsung. Jika Anda menaruh CDN atau proxy lain di depan Dokploy, atur trusted IP pada Traefik terlebih dahulu.

Untuk deploy manual tanpa Dokploy, build masih menghasilkan file statis di `apps/web/build/`, termasuk `200.html` untuk URL room dinamis. [Contoh Caddyfile](./deploy/Caddyfile.example) tetap tersedia untuk cara tersebut. Frontend memakai URL API pada domain yang sama; jika API berada di domain lain, set `VITE_POCKETBASE_URL` saat build dan atur CORS PocketBase.

Batas room 10 pemain, satu update progres paling cepat per 2 detik dari browser, dan request body maksimal 2 KiB. Progres tidak ditulis ke SQLite. Host dapat mengulang ronde dengan kode yang sama; podium tiap ronde dan poin kumulatif disimpan di PocketBase.
