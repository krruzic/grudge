#!/usr/bin/env bash
# Installs the controller udev rules Chrome needs (asks for sudo once):
#   - Switch 1 Pro / Joy-Con / 8BitDo-in-Switch-mode: hidraw access (Chrome reads them over hidraw, USB and Bluetooth)
#   - Switch 2 Pro / NSO GameCube over USB: the WebUSB wake-up and WebHID input (tools/procon2)
#   - Switch 1 Pro over Bluetooth: Chrome on Linux never shows it (crbug 556789080), so a user service mirrors
#     each one (via the kernel's hid-nintendo driver) into a virtual Xbox 360 pad Chrome does show
#   - GameCube adapter rules come with its driver (pnpm gcadapter:install), Bluetooth Switch 2 with switch2:install.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
sudo install -m 0644 "$DIR/71-grudge-nintendo-hidraw.rules" /etc/udev/rules.d/71-grudge-nintendo-hidraw.rules
sudo install -m 0644 "$DIR/../procon2/99-procon2.rules" /etc/udev/rules.d/99-procon2.rules
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=hidraw --subsystem-match=usb || true
# Switch 1 mirror: shares the Switch 2 bridge's Python env (tools/switch2-bt) and its uhid access rule.
BT="$(cd "$DIR/../switch2-bt" && pwd)"
export PATH="$HOME/.local/bin:$PATH"
command -v uv >/dev/null 2>&1 || curl -LsSf https://astral.sh/uv/install.sh | sh
uv python install 3.12
[ -x "$BT/.venv/bin/python" ] || uv venv -q --python 3.12 "$BT/.venv"
uv pip install -q --python "$BT/.venv/bin/python" -r "$BT/requirements.txt"
sudo install -m 0644 "$BT/70-grudge-switch2-bt.rules" /etc/udev/rules.d/70-grudge-switch2-bt.rules
printf 'uhid\nuinput\n' | sudo tee /etc/modules-load.d/grudge-uinput.conf >/dev/null
sudo modprobe uhid
sudo udevadm control --reload-rules
sudo udevadm trigger --name-match=uhid || true
mkdir -p "$HOME/.config/systemd/user"
sed "s|@DIR@|$BT|g" "$DIR/grudge-switch1-mirror.service.in" > "$HOME/.config/systemd/user/grudge-switch1-mirror.service"
systemctl --user daemon-reload
systemctl --user enable --now grudge-switch1-mirror.service >/dev/null 2>&1
systemctl --user restart grudge-switch1-mirror.service
echo "Installed. Reconnect the controllers (or re-pair over Bluetooth) and restart Chrome."
for n in /dev/hidraw*; do
  [ -e "$n" ] || continue
  id=$(udevadm info -q path -n "$n" 2>/dev/null | grep -o '[0-9A-F]\{4\}:[0-9A-F]\{4\}:[0-9A-F]\{4\}' | tail -1)
  case "$id" in *057E:200[679E]* | *20D6:A711*) echo "  $n ($id): $([ -r "$n" ] && [ -w "$n" ] && echo ok || echo 'no access yet - replug it')";; esac
done
