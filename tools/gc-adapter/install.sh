#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  exec sudo "$0" "$@"
fi

HERE=$(cd "$(dirname "$0")" && pwd)
NAME=hid-gamecube-adapter
VER=$(sed -n 's/^PACKAGE_VERSION="\(.*\)"/\1/p' "$HERE/src/dkms.conf")
DST=/usr/src/$NAME-$VER

for cmd in dkms make patch; do
  command -v "$cmd" >/dev/null || { echo "missing: $cmd (Arch: pacman -S dkms base-devel)"; exit 1; }
done
if [ ! -d "/lib/modules/$(uname -r)/build" ]; then
  echo "missing kernel headers for $(uname -r) (Arch: pacman -S linux-headers, or the headers for your kernel flavour)"
  exit 1
fi

if command -v pacman >/dev/null && pacman -Qq hid-gamecube-adapter-dkms-git >/dev/null 2>&1; then
  echo "note: AUR hid-gamecube-adapter-dkms-git is installed; its DKMS module is removed below so only this build loads"
fi

for v in $(dkms status "$NAME" 2>/dev/null | sed -n "s#^$NAME/\([^,]*\),.*#\1#p" | sort -u); do
  dkms remove "$NAME/$v" --all || true
done

rm -rf "$DST"
mkdir -p "$DST"
cp -r "$HERE/src/." "$DST/"
dkms install "$NAME/$VER"

install -m 0644 "$HERE"/udev/*.rules /etc/udev/rules.d/
udevadm control --reload-rules
udevadm trigger --subsystem-match=usb --subsystem-match=hidraw || true

modprobe -r hid_gamecube_adapter 2>/dev/null || true
modprobe hid_gamecube_adapter
sleep 1

echo
echo "installed $NAME/$VER for $(uname -r)"
if ls -d /sys/bus/hid/devices/*057E:0337*/gcport* >/dev/null 2>&1; then
  echo "per-port devices:"
  ls -d /sys/bus/hid/devices/*057E:0337*/gcport*
else
  echo "adapter not detected (plug it in; ports appear as gcport1-gcport4 under the adapter)"
fi
grep -B1 -A1 -i "gamecube controller" /proc/bus/input/devices | grep -E "^N:|^P:" || true
