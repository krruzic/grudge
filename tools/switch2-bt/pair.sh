#!/usr/bin/env bash
# Pairs one Switch 2 controller (hold its small Sync button until the LEDs chase), then restarts the background
# bridge. Usage: pair.sh [player 1-8]. Run once per controller.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE=grudge-switch2-bt.service
[ -x "$DIR/.venv/bin/python" ] || { echo "Run tools/switch2-bt/install.sh (npm run switch2:install) first."; exit 1; }
# The bridge holds the Bluetooth link while it runs; pair with it stopped.
systemctl --user stop "$SERVICE" 2>/dev/null || true
trap 'systemctl --user start "$SERVICE"' EXIT
echo "Hold the Sync button on the controller until its LEDs chase..."
cd "$DIR"
"$DIR/.venv/bin/python" -m ngc pair --timeout 45 ${1:+--player "$1"}
