#!/usr/bin/env bash
# Quick sweep + compact view for tuning. Usage: scripts/sweep-brief.sh <name> [seeds] [ai|random]
set -euo pipefail
NAME=$1; SEEDS=${2:-20}; POLICY=${3:-ai}
scripts/balance-parallel.sh "$SEEDS" "balance-out/$NAME" "$POLICY" 2>&1 | grep -v "runs (" > "balance-out/$NAME.txt"
F="balance-out/$NAME.txt"
sed -n '2,/^Classes/p' "$F" | grep -v '^Classes'
