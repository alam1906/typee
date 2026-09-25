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

Workflow [deploy.yml](./.github/workflows/deploy.yml) berjalan setelah push ke `main` atau secara manual. GitHub Actions memeriksa proyek, membangun image web dan PocketBase untuk `amd64` serta `arm64`, lalu mengirim keduanya ke GitHub Container Registry (GHCR). Dokploy hanya menarik image dan menjalankan [compose.yaml](./deploy/compose.yaml); tidak ada `build:` di Compose. Web memakai Nginx untuk file statis dan meneruskan `/api/*` ke PocketBase di jaringan internal. Hanya web yang diberi domain publik.

Siapkan layanan satu kali sebelum push pertama:

1. Pastikan kode ini berada di repository GitHub dan branch deploy bernama `main`. Dua image akan bernama `ghcr.io/OWNER/REPO-web:latest` dan `ghcr.io/OWNER/REPO-pocketbase:latest` (huruf kecil). Jika repository privat, hubungkan GHCR ke Dokploy dengan GitHub token yang memiliki izin `read:packages`; izinkan token itu mengakses kedua package. Alternatifnya, jadikan kedua package publik.
2. Di Dokploy buat proyek lalu layanan **Compose** bertipe **Docker Compose**, sumber **GitHub/Git**, branch `main`, dan Compose Path `./deploy/compose.yaml`. Jangan pilih build Dockerfile atau Nixpacks. Matikan auto deploy dari GitHub di Dokploy agar deploy hanya terjadi setelah kedua image selesai dikirim oleh Actions.
3. Pada Environment layanan Compose, set `TYPEE_IMAGE_PREFIX=ghcr.io/owner/repo` sesuai nama repository dalam huruf kecil, tanpa akhiran `-web` atau `-pocketbase`. Tambahkan domain website ke service `web` pada port `80` melalui tab Domains Dokploy. Jangan beri domain atau host port ke service `pocketbase`.
4. Catat **Compose ID** dari Dokploy, buat API key Dokploy, lalu tambahkan GitHub Actions secrets `DOKPLOY_URL` (misalnya `https://dokploy.example.com`), `DOKPLOY_API_KEY`, dan `DOKPLOY_COMPOSE_ID`. GitHub `GITHUB_TOKEN` otomatis dipakai untuk menulis package ke GHCR.
5. Jalankan workflow `Build and deploy` atau push ke `main`. Periksa status deployment di Dokploy, `https://DOMAIN/health`, dan `https://DOMAIN/api/health`. Buat superuser PocketBase pertama melalui konsol layanan PocketBase di Dokploy jika diperlukan.

Volume Docker bernama `typee-pocketbase-data` menyimpan `pb_data` antar deploy. Jangan hapus volume ini saat redeploy; atur backup PocketBase secara terpisah. Image hanya membawa hooks dan migrasi dari Git, tidak membawa database lokal. Migrasi berjalan otomatis saat PocketBase mulai. Saat mengganti versi PocketBase atau mengubah migrasi, ambil backup sebelum deploy.

Image memakai tag `latest` untuk deploy otomatis dan tag SHA commit untuk penelusuran atau rollback manual. Dalam satu server, trafik web dapat terputus sebentar saat container diganti. Konfigurasi ini mengasumsikan Traefik Dokploy menjadi satu-satunya pintu masuk ke web dan tidak mempercayai `X-Forwarded-*` dari klien langsung. Nginx meneruskan IP yang diberikan Traefik agar rate limit PocketBase tetap per pengunjung. Jika Anda menaruh CDN atau proxy lain di depan Dokploy, atur trusted IP pada Traefik terlebih dahulu.

Untuk deploy manual tanpa Dokploy, build masih menghasilkan file statis di `apps/web/build/`, termasuk `200.html` untuk URL room dinamis. [Contoh Caddyfile](./deploy/Caddyfile.example) tetap tersedia untuk cara tersebut. Frontend memakai URL API pada domain yang sama; jika API berada di domain lain, set `VITE_POCKETBASE_URL` saat build dan atur CORS PocketBase.

Batas room 10 pemain, satu update progres paling cepat per 2 detik dari browser, dan request body maksimal 2 KiB. Progres tidak ditulis ke SQLite. Host dapat mengulang ronde dengan kode yang sama; podium tiap ronde dan poin kumulatif disimpan di PocketBase.
