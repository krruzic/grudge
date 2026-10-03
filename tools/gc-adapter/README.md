# GameCube adapter on Linux (Grudge)

The Wii U / Mayflash GameCube adapter (USB `057e:0337`) shows up in Chrome as four separate pads, one per port, with this patched copy of the `hid-gamecube-adapter` kernel driver.

## Why a patched driver

Chromium groups Linux gamepads by the sysfs path above each input node. The stock driver registers every port as a parentless virtual input device, so all four ports share `/sys/devices/virtual/` and Chrome shows only one pad. The patch (`per-port-parent.patch`, already applied in `src/`) gives each port its own child device (`gcport1`-`gcport4`) under the adapter, plus a unique `phys`/`uniq`. It also cancels pending connect work when the adapter is removed.

## Files

- `src/`: the full driver source, with the patch applied. It's built and installed through DKMS as `hid-gamecube-adapter/r11.25387ab.grudge1`. Upstream is the `hid-gamecube-adapter-dkms-git` AUR package, `r11.25387ab`, GPL-2.0+.
- `per-port-parent.patch`: the change against upstream, kept for reference and for rebasing onto a newer upstream.
- `udev/`: rules that let your user (and Chrome's WebHID fallback) open the adapter without root.
- `install.sh`: builds, installs and loads everything.

## Install on a new machine

1. Install the prerequisites. On Arch: `sudo pacman -S dkms base-devel linux-headers`, using the headers package that matches your kernel (`linux-zen-headers`, `linux-lts-headers`, ...).
2. Run `tools/gc-adapter/install.sh`. It re-runs itself with sudo and then:
   - removes any other DKMS version of `hid-gamecube-adapter`, including the AUR one;
   - copies `src/` to `/usr/src/hid-gamecube-adapter-<version>` and runs `dkms install`;
   - installs the udev rules and reloads udev;
   - reloads the module and prints the detected ports.
3. Plug in the adapter. Each port appears as `Standard Gamecube Controller` (or `Wavebird Gamecube Controller`) with its own `gcportN` parent.
4. Open the game in Chrome and press a button on each controller. Each port joins as its own player.

DKMS rebuilds the module automatically on kernel updates (`AUTOINSTALL="yes"`). If a kernel update ever leaves you with one merged pad again, re-run `install.sh`.

## Check it's working

```sh
dkms status hid-gamecube-adapter
ls -d /sys/bus/hid/devices/*057E:0337*/gcport*
grep -B1 -A1 -i "gamecube controller" /proc/bus/input/devices
```

In the game, the controller profile `gc_adapter_uinput` in `data/input.json` matches these devices.

## Uninstall

```sh
sudo dkms remove hid-gamecube-adapter/r11.25387ab.grudge1 --all
sudo rm -rf /usr/src/hid-gamecube-adapter-r11.25387ab.grudge1
sudo rm /etc/udev/rules.d/51-gcadapter.rules /etc/udev/rules.d/51-gcadapter-hidraw.rules
```

## Updating to a newer upstream

Copy the new upstream source over `src/` and run `patch -p1 -d src < per-port-parent.patch`. Then bump `PACKAGE_VERSION` in `src/dkms.conf` and re-run `install.sh`.
