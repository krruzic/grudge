#!/usr/bin/env bash
# Removes the background service (paired controllers stay saved in ~/.config/nso-gc).
set -euo pipefail
SERVICE=grudge-switch2-bt.service
systemctl --user disable --now "$SERVICE" 2>/dev/null || true
rm -f "$HOME/.config/systemd/user/$SERVICE"
systemctl --user daemon-reload
echo "Service removed. To also drop the uinput rule: sudo rm /etc/udev/rules.d/70-grudge-switch2-bt.rules /etc/modules-load.d/grudge-uinput.conf"
