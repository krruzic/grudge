# Switch 2 controllers over Bluetooth

The NSO GameCube controller and the Pro Controller 2 speak Nintendo's own Bluetooth LE protocol, which Linux
doesn't understand. `ngc/` is a small background bridge that talks to them and creates a normal virtual gamepad
for each. Grudge (and Steam, SDL, emulators) then sees an ordinary pad.

```sh
pnpm switch2:install   # once: Python env, uinput access (may ask for sudo), service that starts at login
pnpm switch2:pair      # once per controller: hold Sync until the LEDs chase (optional: <player 1-8>)
```

After that, press any button on a paired controller and it connects; nothing to run. USB still works without any
of this (the P / G permission steps in the game).

- Logs: `journalctl --user -u grudge-switch2-bt -f`
- Saved controllers: `.venv/bin/python -m ngc list` / `remove --mac ...` (in this folder), stored in
  `~/.config/nso-gc/config.json`.
- Remove the service: `tools/switch2-bt/uninstall.sh`.

Each pad is created through `/dev/uhid` (falling back to uinput), so every controller is its own gamepad in the
browser: Chromium on Linux merges all uinput pads into one, because they share a sysfs parent. Each pad is presented
as a wired Xbox 360 controller named `Switch 2 BT GC (P1)` / `Switch 2 BT Pro (P1)`, so
browsers give it the standard button layout; `data/input.json` profiles `switch2_bt_gc` / `switch2_bt_pro` map it
like the USB versions.

`ngc/` is vendored from [trevlars/switch2-controllers-linux](https://github.com/trevlars/switch2-controllers-linux)
(MIT, see `LICENSE`) at `a0a36e6`. Changed: `gamepad.py` (uhid pads, Xbox 360 identity and key set, separate L / ZL and R / Z,
trigger clicks on the trigger axes, the pad name). uhid pads have no rumble (Grudge doesn't use it).
