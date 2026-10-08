#!/usr/bin/env bash
# One-time setup for Switch 2 controllers over Bluetooth (NSO GameCube, Pro Controller 2).
# Creates the bridge's Python environment, lets your user create virtual pads (one sudo step, only if needed) and
# installs a systemd user service that starts at login and keeps running in the background.
# Then pair each controller once with pair.sh; after that, pressing a button on it connects it.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE=grudge-switch2-bt.service
export PATH="$HOME/.local/bin:$PATH"

if ! command -v uv >/dev/null 2>&1; then
  echo ">> installing uv (user-space Python manager)"
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi

# bleak 0.22.2 is the bridge's known-good pin; it wants Python 3.12.
echo ">> Python environment (tools/switch2-bt/.venv)"
uv python install 3.12
[ -x "$DIR/.venv/bin/python" ] || uv venv -q --python 3.12 "$DIR/.venv"
uv pip install -q --python "$DIR/.venv/bin/python" -r "$DIR/requirements.txt"

if ! lsmod | grep -q '^uinput' || [ ! -w /dev/uinput ] || [ ! -f /etc/udev/rules.d/70-grudge-switch2-bt.rules ]; then
  echo ">> uinput access (sudo)"
  sudo install -m 0644 "$DIR/70-grudge-switch2-bt.rules" /etc/udev/rules.d/70-grudge-switch2-bt.rules
  echo uinput | sudo tee /etc/modules-load.d/grudge-uinput.conf >/dev/null
  sudo modprobe uinput
  sudo udevadm control --reload-rules
  sudo udevadm trigger --name-match=uinput || true
fi

echo ">> systemd user service ($SERVICE, starts at login)"
mkdir -p "$HOME/.config/systemd/user"
sed "s|@DIR@|$DIR|g" "$DIR/grudge-switch2-bt.service.in" > "$HOME/.config/systemd/user/$SERVICE"
systemctl --user daemon-reload
systemctl --user enable "$SERVICE" >/dev/null 2>&1
command -v bluetoothctl >/dev/null && bluetoothctl power on >/dev/null 2>&1 || true

if [ -s "${XDG_CONFIG_HOME:-$HOME/.config}/nso-gc/config.json" ]; then
  systemctl --user restart "$SERVICE"
  echo "Done. The bridge is running; press a button on a paired controller to connect it."
else
  echo "Done. Now pair each controller once: npm run switch2:pair"
fi
