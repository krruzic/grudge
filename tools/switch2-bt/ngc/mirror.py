"""Switch 1 pad mirror (Grudge).

Chromium on Linux never exposes a Switch 1 Pro Controller connected over Bluetooth through the gamepad API
(crbug 556789080: it drops the pad's joystick device to run its own Nintendo handshake over hidraw, which fails),
and it hides the pad from WebHID too. The kernel's hid-nintendo driver reads it fine, so this mirrors every such
pad (Pro Controller 057e:2009 - including 8BitDo and other pads in Switch mode - and PowerA's licensed pad
20d6:a711) into a virtual Xbox 360 pad (UhidGamepad, the same kind the Switch 2 bridge makes), which browsers
treat as a standard gamepad. The real device is grabbed so other programs only see the mirror, not both.

Run: python -m ngc mirror (the grudge-switch1-mirror user service does this at login).
"""

from __future__ import annotations

import logging
import threading
import time

from evdev import InputDevice, ecodes as e, list_devices

from . import protocol as P
from .gamepad import UhidGamepad, UinputGamepad

logger = logging.getLogger(__name__)

MIRRORED = {(0x057E, 0x2009), (0x20D6, 0xA711)}

# hid-nintendo key codes -> Switch button names (protocol.SWITCH_BUTTONS).
KEYS = {
    e.BTN_EAST: "A",
    e.BTN_SOUTH: "B",
    e.BTN_NORTH: "X",
    e.BTN_WEST: "Y",
    e.BTN_TL: "L",
    e.BTN_TR: "R",
    e.BTN_TL2: "ZL",
    e.BTN_TR2: "ZR",
    e.BTN_SELECT: "MINUS",
    e.BTN_START: "PLUS",
    e.BTN_MODE: "HOME",
    e.BTN_Z: "CAPTURE",
    e.BTN_THUMBL: "L_STK",
    e.BTN_THUMBR: "R_STK",
    e.BTN_DPAD_UP: "UP",
    e.BTN_DPAD_DOWN: "DOWN",
    e.BTN_DPAD_LEFT: "LEFT",
    e.BTN_DPAD_RIGHT: "RIGHT",
}


def wanted(d: InputDevice) -> bool:
    """A Switch 1 pad's main joystick device (not its IMU node, not one of our own mirrors)."""
    if (d.info.vendor, d.info.product) not in MIRRORED:
        return False
    if "imu" in d.name.lower():
        return False
    caps = d.capabilities(verbose=False)
    return e.EV_ABS in caps and e.EV_KEY in caps


class Mirror:
    def __init__(self, path: str, player: int):
        self.dev = InputDevice(path)
        self.path = path
        label = f"Switch Pro BT (P{player})"
        try:
            self.out = UhidGamepad(name=label, product=0x2009, mac=self.dev.uniq or path, label=label)
        except OSError:
            self.out = UinputGamepad(name=label, product=0x2009, mac=self.dev.uniq or path)
        self.keys: set[str] = set()
        self.hat = [0, 0]
        self.axes = {e.ABS_X: 0, e.ABS_Y: 0, e.ABS_RX: 0, e.ABS_RY: 0}
        self.rng = {c: max(1, ai.max) for c, ai in self.dev.capabilities(verbose=False).get(e.EV_ABS, [])}

    def push(self) -> None:
        bits = 0
        for name in self.keys:
            bits |= P.SWITCH_BUTTONS.get(name, 0)
        if self.hat[0] < 0:
            bits |= P.SWITCH_BUTTONS["LEFT"]
        if self.hat[0] > 0:
            bits |= P.SWITCH_BUTTONS["RIGHT"]
        if self.hat[1] < 0:
            bits |= P.SWITCH_BUTTONS["UP"]
        if self.hat[1] > 0:
            bits |= P.SWITCH_BUTTONS["DOWN"]
        n = lambda c: max(-1.0, min(1.0, self.axes[c] / self.rng.get(c, 32767)))
        # evdev Y is down-positive; the pad API takes up-positive.
        self.out.update(bits, (n(e.ABS_X), -n(e.ABS_Y)), (n(e.ABS_RX), -n(e.ABS_RY)), 0, 0)

    def run(self) -> None:
        try:
            self.dev.grab()
        except OSError as exc:
            logger.warning("could not grab %s (%s); other programs will see it twice", self.path, exc)
        logger.info("mirroring %s (%s)", self.dev.name, self.path)
        try:
            for ev in self.dev.read_loop():
                if ev.type == e.EV_KEY and ev.code in KEYS:
                    (self.keys.add if ev.value else self.keys.discard)(KEYS[ev.code])
                elif ev.type == e.EV_ABS:
                    if ev.code == e.ABS_HAT0X:
                        self.hat[0] = ev.value
                    elif ev.code == e.ABS_HAT0Y:
                        self.hat[1] = ev.value
                    elif ev.code in self.axes:
                        self.axes[ev.code] = ev.value
                elif ev.type == e.EV_SYN:
                    self.push()
        except OSError:
            pass
        finally:
            logger.info("pad gone: %s", self.path)
            self.out.close()


def run() -> int:
    """Watches for Switch 1 pads (every 2 s) and mirrors each one while it stays connected."""
    live: dict[str, threading.Thread] = {}
    numbers: dict[str, int] = {}
    while True:
        for path in list(live):
            if not live[path].is_alive():
                del live[path]
                numbers.pop(path, None)
        for path in list_devices():
            if path in live:
                continue
            try:
                d = InputDevice(path)
                ok = wanted(d)
                d.close()
            except OSError:
                continue
            if not ok:
                continue
            # Lowest free player number, so a pad that reconnects doesn't duplicate another's label.
            n = next(k for k in range(1, 99) if k not in numbers.values())
            numbers[path] = n
            m = Mirror(path, n)
            t = threading.Thread(target=m.run, name=f"mirror-{path}", daemon=True)
            t.start()
            live[path] = t
        time.sleep(2)
