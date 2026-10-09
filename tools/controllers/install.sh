#!/usr/bin/env bash
# Installs the controller udev rules Chrome needs (asks for sudo once):
#   - Switch 1 Pro / Joy-Con / 8BitDo-in-Switch-mode: hidraw access (Chrome reads them over hidraw, USB and Bluetooth)
#   - Switch 2 Pro / NSO GameCube over USB: the WebUSB wake-up and WebHID input (tools/procon2)
#   - GameCube adapter rules come with its driver (npm run gcadapter:install), Bluetooth Switch 2 with switch2:install.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
sudo install -m 0644 "$DIR/71-grudge-nintendo-hidraw.rules" /etc/udev/rules.d/71-grudge-nintendo-hidraw.rules
sudo install -m 0644 "$DIR/../procon2/99-procon2.rules" /etc/udev/rules.d/99-procon2.rules
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=hidraw --subsystem-match=usb || true
echo "Installed. Reconnect the controllers (or re-pair over Bluetooth) and restart Chrome."
for n in /dev/hidraw*; do
  [ -e "$n" ] || continue
  id=$(udevadm info -q path -n "$n" 2>/dev/null | grep -o '[0-9A-F]\{4\}:[0-9A-F]\{4\}:[0-9A-F]\{4\}' | tail -1)
  case "$id" in *057E:200[679E]* | *20D6:A711*) echo "  $n ($id): $([ -r "$n" ] && [ -w "$n" ] && echo ok || echo 'no access yet - replug it')";; esac
done
