#!/usr/bin/env bash
# MySanad — local pre-deployment check.
# Verifies the project builds and every test passes before you push to GitHub / Vercel.
# It does NOT deploy, push, or touch any Supabase project.
set -euo pipefail

echo "== MySanad: semakan sebelum penggunaan =="

if [ ! -f ".env.local" ]; then
  echo "[!] .env.local tiada. Salin .env.example dan isi nilai Supabase anda:"
  echo "    cp .env.example .env.local"
  exit 1
fi

echo "[1/6] Pakej (npm ci)"
npm ci

echo "[2/6] Semakan seni bina"
node tests/verify-architecture.mjs

echo "[3/6] TypeScript"
npm run typecheck

echo "[4/6] ESLint"
npm run lint

echo "[5/6] Ujian unit, komponen & pangkalan data"
npm run test

echo "[6/6] Binaan produksi"
npm run build

echo
echo "Semua semakan lulus. Langkah seterusnya: lihat DEPLOYMENT.md."
