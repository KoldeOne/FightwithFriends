#!/usr/bin/env bash
# Run the balance sweep on every core, then merge. Usage: scripts/balance-parallel.sh [seeds] [outdir] [ai|random]
set -euo pipefail
SEEDS=${1:-6}
OUT=${2:-balance-out}
POLICY=${3:-ai}
N=$(nproc)
mkdir -p "$OUT"
for i in $(seq 0 $((N - 1))); do
  npx vite-node scripts/balance.ts -- --seeds "$SEEDS" --policy "$POLICY" --shard "$i/$N" --out "$OUT/shard$i.json" &
done
wait
npx vite-node scripts/balance.ts -- --merge "$OUT"/shard*.json --summary "$OUT/summary.json"
