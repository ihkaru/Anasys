# ADR-0004: Pure Bun Ecosystem (All-in-One Toolchain)

## Status
Approved (April 2026)

## Konteks
Monorepo Anasys terdiri dari berbagai lapisan teknologi:
- **Bun API Gateway** (`apps/api`) - TypeScript/Elysia.js.
- **Vue 3/Vite Frontend** (`apps/frontend`) - TypeScript.
- **Shared Drizzle ORM Schema** (`packages/db`) - TypeScript.
- **Rust Performance Engine** (`apps/engine`) - High-performance data ingestion.

Dalam mengelola *dependencies* TypeScript/JavaScript, awalnya terdapat kebingungan arsitektural antara mencampur penggunaan PNPM (sebagai *package manager*) dan Bun (sebagai *runtime*). Menggunakan dua *package manager* berbeda di satu *repository* berisiko memunculkan konflik *lockfile* ganda, duplikasi *cache*, dan kompleksitas *toolchain*.

## Keputusan Arsitektur
Mulai April 2026, Anasys mengadopsi standar **Pure Bun Ecosystem** untuk seluruh komponen berbasis JavaScript/TypeScript. Komponen **Rust Performance Engine** dikecualikan dari standar ini dan tetap dikelola secara native menggunakan `cargo`.

Bun akan digunakan sebagai satu-satunya *toolchain* untuk seluruh ekosistem JS/TS:

1.  **Package Manager (`bun install`)**: 
    - Menggantikan npm/pnpm. Menggunakan algoritma *global cache* dan resolusi *native* berkecepatan tinggi.
    - File `bun.lock` bertindak sebagai *source of truth* untuk resolusi dependensi (mendukung format *binary* untuk CI/CD yang lebih kencang).
2.  **Workspace Manager (`bun --filter`)**: 
    - Mengelola interaksi *cross-package* (`@apps/backend` -> `@packages/db`) langsung secara *native* dari properti `"workspaces"` di `package.json` tanpa `pnpm-workspace.yaml`.
3.  **Runtime & Test Runner (`bun run`, `bun test`)**: 
    - Eksekusi instan untuk file TypeScript (Elysia.js backend) dan *test suite*.

## Konsekuensi
- **Positif**:
    - **Zero Tooling Fatigue**: Hanya memerlukan satu CLI tool (`bun`) untuk seluruh siklus pengembangan (install, dev, build, test, lint).
    - **Instalasi Super Cepat**: Waktu resolusi *node_modules* terpangkas signifikan dibandingkan alat lain.
    - **Native TS Support**: Tidak perlu `ts-node` atau konfigurasi kompilasi tambahan di *backend*.
- **Negatif**:
    - **Vendor Lock-in**: Ekosistem sangat bergantung pada siklus rilis dan *bug-fixes* dari tim pengembang Bun. Jika ada fitur *cutting-edge* yang *broken* di Bun, seluruh *pipeline* akan terpengaruh (mitigasi: mengunci versi spesifik di produksi).

## Referensi
- Diskusi optimasi *monorepo* April 2026.
- Rilis Bun Workspace v1.x+.
