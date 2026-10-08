#!/usr/bin/env bash
# Shows whether the patched GameCube adapter driver is built, loaded and seeing the adapter's ports.
NAME=hid-gamecube-adapter
echo "DKMS:   $(dkms status "$NAME" 2>/dev/null | tr '\n' ' ' || echo 'dkms not installed')"
lsmod | grep -q '^hid_gamecube_adapter' && echo "Module: loaded" || echo "Module: not loaded (sudo modprobe hid_gamecube_adapter)"
ls /etc/udev/rules.d/51-gcadapter*.rules >/dev/null 2>&1 && echo "Udev:   rules installed" || echo "Udev:   rules missing"
if ports=$(ls -d /sys/bus/hid/devices/*057E:0337*/gcport* 2>/dev/null); then
  echo "Ports:  $(echo "$ports" | xargs -n1 basename | tr '\n' ' ')"
else
  echo "Ports:  adapter not detected (plugged in? black USB plug is the data one)"
fi
grep -i "gamecube controller" /proc/bus/input/devices | sed 's/^N: Name=/Pad:    /' || true
