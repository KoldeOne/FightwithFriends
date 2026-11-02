#!/usr/bin/env bash
# Quick sweep + compact view for tuning: KPIs, classes, worst rounds. Usage: scripts/sweep-brief.sh <name> [seeds]
set -euo pipefail
NAME=$1; SEEDS=${2:-6}
scripts/balance-parallel.sh "$SEEDS" "balance-out/$NAME" 2>&1 | grep -v "runs (" > "balance-out/$NAME.txt"
F="balance-out/$NAME.txt"
sed -n 2,4p "$F"
sed -n '/^Classes/,/^$/p' "$F" | tail -n +2
echo "Rounds with 25%+ losses:"
sed -n '/^Rounds/,/^$/p' "$F" | tail -n +2 | awk '{gsub("%","",$5); if ($5+0 >= 25) print}'
