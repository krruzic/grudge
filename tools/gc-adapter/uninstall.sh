#!/usr/bin/env bash
# Removes the patched driver (every DKMS version of it) and its udev rules.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then
  exec sudo "$0" "$@"
fi
NAME=hid-gamecube-adapter
modprobe -r hid_gamecube_adapter 2>/dev/null || true
for v in $(dkms status "$NAME" 2>/dev/null | sed -n "s#^$NAME/\([^,]*\),.*#\1#p" | sort -u); do
  dkms remove "$NAME/$v" --all || true
  rm -rf "/usr/src/$NAME-$v"
done
rm -f /etc/udev/rules.d/51-gcadapter.rules /etc/udev/rules.d/51-gcadapter-hidraw.rules
udevadm control --reload-rules
echo "removed $NAME and its udev rules"
