"""Linux virtual gamepad (uinput) for Switch 2 controllers.

Presents a standard dual-stick gamepad with analog triggers (GameCube) or
digital ZL/ZR (Pro / Joy-Con) so SDL, Steam Input, and emulators recognise
pads without custom kernel support.
"""

from __future__ import annotations

import logging
import struct
import threading
from typing import Callable, Optional

from evdev import UInput, AbsInfo, ecodes as e

from . import protocol as P
from .motion_evdev import phys_for_mac

logger = logging.getLogger(__name__)

# struct input_event on 64-bit Linux: timeval(2*long) + type + code + value
_EVENT_FMT = "llHHi"
_EVENT_SIZE = struct.calcsize(_EVENT_FMT)

# Axis ranges.
STICK_MIN, STICK_MAX = -32768, 32767
TRIGGER_MIN, TRIGGER_MAX = 0, 255

# --------------------------------------------------------------------------- #
# Evdev maps                                                                   #
#                                                                             #
# BLE input uses the unified Switch 2 bitmask in protocol.SWITCH_BUTTONS      #
# (Nadeflore/switch2-controllers, bitaxislabs). On the NSO GameCube pad the   #
# ZR bit (0x80) is physical Z; R bit (0x40) is R trigger full-click. For Steam /
# Switch-style layouts, ZL+ L -> BTN_TL (left bumper) and Z+ R click -> BTN_TR
# (right bumper). C -> BTN_SELECT (minus). Analog L/R stay on trigger axes.      #
#                                                                             #
# Face buttons use semantic evdev positions (A=SOUTH, B=EAST, X=WEST, Y=NORTH).
# BTN_C (306) sits between B and the face cluster, so SDL's auto gamecontrollerdb
# assigns x:b3/y:b4 to the wrong indices — install-emulator-integration.sh writes
# a corrected mapping for Steam. Dolphin uses WEST/NORTH tokens directly.
#
# NSO GameCube has Start (PLUS bit) and Home (HOME bit), no Select/MINUS.
# Capture/C need misc slots in gamecontrollerdb.
# --------------------------------------------------------------------------- #

# Grudge: every pad is presented as a wired Xbox 360 pad (045e:028e) with exactly the xpad driver's keys and
# axes, so browsers (and SDL / Steam) apply their built-in standard mapping and the button numbers never shift:
# standard 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 10 / 11 stick clicks, 12-15 D-pad,
# 16 Guide. Grudge's data/input.json profiles "switch2_bt_gc" / "switch2_bt_pro" (matched by the name) read it.
XPAD_KEYS = [
    e.BTN_A, e.BTN_B, e.BTN_X, e.BTN_Y, e.BTN_TL, e.BTN_TR,
    e.BTN_SELECT, e.BTN_START, e.BTN_MODE, e.BTN_THUMBL, e.BTN_THUMBR,
]
XPAD_VENDOR, XPAD_PRODUCT = 0x045E, 0x028E

# Pro Controller 2 / Joy-Con: L / R bumpers, ZL / ZR are the triggers (see TRIGGER_BITS).
PRO_BUTTON_MAP = {
    "A": e.BTN_A,
    "B": e.BTN_B,
    "X": e.BTN_X,
    "Y": e.BTN_Y,
    "L": e.BTN_TL,
    "R": e.BTN_TR,
    "PLUS": e.BTN_START,
    "MINUS": e.BTN_SELECT,
    "HOME": e.BTN_MODE,
    "L_STK": e.BTN_THUMBL,
    "R_STK": e.BTN_THUMBR,
}

# NSO GameCube: ZL left bumper, Z (the ZR bit) right bumper, analog L / R the triggers (their full clicks too);
# C on Back. Every button stays its own input (upstream shared L / ZL and R / Z on one code).
GAMECUBE_BUTTON_MAP = {
    "A": e.BTN_A,
    "B": e.BTN_B,
    "X": e.BTN_X,
    "Y": e.BTN_Y,
    "ZL": e.BTN_TL,
    "ZR": e.BTN_TR,
    "PLUS": e.BTN_START,
    "HOME": e.BTN_MODE,
    "C": e.BTN_SELECT,
}

DEFAULT_BUTTON_MAP = PRO_BUTTON_MAP

# Switch buttons that drive the trigger axes (pressed = full): digital ZL / ZR on the Pro, the GC's L / R clicks.
TRIGGER_BITS = {"pro": ("ZL", "ZR"), "gc": ("L", "R")}


def button_map_for_product(product_id: int) -> dict:
    """Return the default evdev map for a Switch 2 controller PID."""
    if product_id == P.NSO_GAMECUBE_PID:
        return GAMECUBE_BUTTON_MAP
    return PRO_BUTTON_MAP


class UinputGamepad:
    def __init__(
        self,
        name: str = "NSO GameCube Controller",
        button_map=None,
        product: int = P.NSO_GAMECUBE_PID,
        mac: str = "",
    ):
        # Only xpad's keys exist on the pad; anything mapped elsewhere (old configs) is dropped.
        self.button_map = {k: v for k, v in (button_map or DEFAULT_BUTTON_MAP).items() if v in XPAD_KEYS}
        keys = list(XPAD_KEYS)
        self.trigger_bits = TRIGGER_BITS["gc" if product == P.NSO_GAMECUBE_PID else "pro"]
        # "Switch 2 BT GC (P1)": Grudge matches the profile by this name (avoid "gamecube" / "pro controller",
        # which its USB-adapter profiles match).
        name = ("Switch 2 BT GC" if product == P.NSO_GAMECUBE_PID else "Switch 2 BT Pro") + (
            name[name.rindex(" (P"):] if " (P" in name else ""
        )

        capabilities = {
            e.EV_KEY: keys,
            e.EV_ABS: [
                (e.ABS_X, AbsInfo(0, STICK_MIN, STICK_MAX, 0, 0, 0)),
                (e.ABS_Y, AbsInfo(0, STICK_MIN, STICK_MAX, 0, 0, 0)),
                (e.ABS_RX, AbsInfo(0, STICK_MIN, STICK_MAX, 0, 0, 0)),
                (e.ABS_RY, AbsInfo(0, STICK_MIN, STICK_MAX, 0, 0, 0)),
                (e.ABS_Z, AbsInfo(0, TRIGGER_MIN, TRIGGER_MAX, 0, 0, 0)),
                (e.ABS_RZ, AbsInfo(0, TRIGGER_MIN, TRIGGER_MAX, 0, 0, 0)),
                (e.ABS_HAT0X, AbsInfo(0, -1, 1, 0, 0, 0)),
                (e.ABS_HAT0Y, AbsInfo(0, -1, 1, 0, 0, 0)),
            ],
            e.EV_FF: [e.FF_RUMBLE, e.FF_PERIODIC, e.FF_CONSTANT, e.FF_GAIN],
        }

        phys = phys_for_mac(mac) if mac else "py-evdev-uinput"
        self.ui = UInput(
            capabilities,
            name=name,
            vendor=XPAD_VENDOR,
            product=XPAD_PRODUCT,
            version=0x0110,
            bustype=e.BUS_USB,
            phys=phys,
        )
        logger.info("created virtual gamepad: %s", self.ui.device.path if self.ui.device else name)

        self._last_keys: dict[int, int] = {}
        self._last_abs: dict[int, int] = {}

        self.rumble_cb: Optional[Callable[[float, float], None]] = None
        self._effects: dict[int, tuple[int, int]] = {}
        self._ff_running = True
        self._ff_thread = threading.Thread(target=self._ff_loop, daemon=True)
        self._ff_thread.start()

    @staticmethod
    def _scale_stick(value: float) -> int:
        v = int(value * STICK_MAX)
        return max(STICK_MIN, min(STICK_MAX, v))

    def _emit_key(self, code: int, pressed: int) -> bool:
        if self._last_keys.get(code) != pressed:
            self.ui.write(e.EV_KEY, code, pressed)
            self._last_keys[code] = pressed
            return True
        return False

    def _emit_abs(self, code: int, value: int) -> bool:
        if self._last_abs.get(code) != value:
            self.ui.write(e.EV_ABS, code, value)
            self._last_abs[code] = value
            return True
        return False

    def update(
        self,
        buttons: int,
        left_stick: tuple[float, float],
        right_stick: tuple[float, float],
        left_trigger: int,
        right_trigger: int,
    ) -> None:
        changed = False

        # Emit every mapped key each frame; OR switch names that share a code
        # (GC R trigger click and Z both use Shoulder R / BTN_TR).
        key_states = {code: 0 for code in XPAD_KEYS}
        for switch_name, key_code in self.button_map.items():
            mask = P.SWITCH_BUTTONS.get(switch_name, 0)
            if mask and (buttons & mask):
                key_states[key_code] = 1
        for key_code, pressed in key_states.items():
            changed |= self._emit_key(key_code, pressed)

        dpad_x = (1 if buttons & P.SWITCH_BUTTONS["RIGHT"] else 0) - (
            1 if buttons & P.SWITCH_BUTTONS["LEFT"] else 0
        )
        dpad_y = (1 if buttons & P.SWITCH_BUTTONS["DOWN"] else 0) - (
            1 if buttons & P.SWITCH_BUTTONS["UP"] else 0
        )
        changed |= self._emit_abs(e.ABS_HAT0X, dpad_x)
        changed |= self._emit_abs(e.ABS_HAT0Y, dpad_y)

        changed |= self._emit_abs(e.ABS_X, self._scale_stick(left_stick[0]))
        changed |= self._emit_abs(e.ABS_Y, -self._scale_stick(left_stick[1]))
        changed |= self._emit_abs(e.ABS_RX, self._scale_stick(right_stick[0]))
        changed |= self._emit_abs(e.ABS_RY, -self._scale_stick(right_stick[1]))
        tl, tr = (P.SWITCH_BUTTONS.get(b, 0) for b in self.trigger_bits)
        if tl and buttons & tl:
            left_trigger = 255
        if tr and buttons & tr:
            right_trigger = 255
        changed |= self._emit_abs(e.ABS_Z, max(0, min(255, left_trigger)))
        changed |= self._emit_abs(e.ABS_RZ, max(0, min(255, right_trigger)))

        if changed:
            self.ui.syn()

    def release_all(self) -> None:
        changed = False
        for code in list(self._last_keys):
            changed |= self._emit_key(code, 0)
        for code, neutral in (
            (e.ABS_X, 0),
            (e.ABS_Y, 0),
            (e.ABS_RX, 0),
            (e.ABS_RY, 0),
            (e.ABS_Z, 0),
            (e.ABS_RZ, 0),
            (e.ABS_HAT0X, 0),
            (e.ABS_HAT0Y, 0),
        ):
            changed |= self._emit_abs(code, neutral)
        if changed:
            self.ui.syn()

    def _ff_loop(self) -> None:
        try:
            for event in self.ui.read_loop():
                if not self._ff_running:
                    break
                try:
                    self._handle_ff_event(event.type, event.code, event.value)
                except Exception:  # noqa: BLE001
                    pass
        except Exception:  # noqa: BLE001
            pass

    def _handle_ff_event(self, etype: int, code: int, value: int) -> None:
        if etype == e.EV_UINPUT and code == e.UI_FF_UPLOAD:
            upload = self.ui.begin_upload(value)
            effect = upload.effect
            if effect.type == e.FF_RUMBLE:
                r = effect.u.ff_rumble_effect
                self._effects[effect.id] = (r.strong_magnitude, r.weak_magnitude)
            upload.retval = 0
            self.ui.end_upload(upload)
        elif etype == e.EV_UINPUT and code == e.UI_FF_ERASE:
            erase = self.ui.begin_erase(value)
            self._effects.pop(erase.effect_id, None)
            erase.retval = 0
            self.ui.end_erase(erase)
        elif etype == e.EV_FF:
            if self.rumble_cb is None:
                return
            if value == 0:
                self.rumble_cb(0.0, 0.0)
            else:
                strong, weak = self._effects.get(code, (0, 0))
                self.rumble_cb(strong / 65535.0, weak / 65535.0)

    def close(self) -> None:
        self._ff_running = False
        if self.rumble_cb is not None:
            try:
                self.rumble_cb(0.0, 0.0)
            except Exception:  # noqa: BLE001
                pass
        try:
            self.ui.close()
        except Exception:  # noqa: BLE001
            pass


# --------------------------------------------------------------------------- #
# UHID pad (Grudge)                                                           #
#                                                                             #
# Chromium on Linux decides which input nodes belong to one gamepad by the    #
# sysfs path of their parent cut at "input": every uinput device sits at      #
# /sys/devices/virtual/input/inputN, so all of them look like ONE pad and     #
# only one controller ever shows up in the browser. A uhid device gets its    #
# own parent (/sys/devices/virtual/misc/uhid/0003:045E:028E.NNNN/), so each   #
# controller is its own gamepad. The HID descriptor below gives hid-generic   #
# exactly xpad's keys and axes (see XPAD_KEYS), so the browser's Xbox 360     #
# standard mapping still applies. No force feedback (Grudge has no rumble).   #
# --------------------------------------------------------------------------- #

UHID_DESTROY = 1
UHID_CREATE2 = 11
UHID_INPUT2 = 12
BUS_USB = 0x03

# Button usages whose hid-input codes (BTN_GAMEPAD + usage - 1) are xpad's keys, in XPAD_KEYS order.
_BUTTON_USAGES = [1, 2, 4, 5, 7, 8, 11, 12, 13, 14, 15]
_REPORT_DESC = bytes(
    [0x05, 0x01, 0x09, 0x05, 0xA1, 0x01]  # Generic Desktop / Gamepad / Application
    + [0x05, 0x09]  # Buttons
    + [b for u in _BUTTON_USAGES for b in (0x09, u)]
    + [0x15, 0x00, 0x25, 0x01, 0x75, 0x01, 0x95, len(_BUTTON_USAGES), 0x81, 0x02]
    + [0x75, 16 - len(_BUTTON_USAGES), 0x95, 0x01, 0x81, 0x03]  # pad to 16 bits
    + [0x05, 0x01, 0x09, 0x39, 0x15, 0x00, 0x25, 0x07, 0x35, 0x00, 0x46, 0x3B, 0x01, 0x65, 0x14]  # Hat 0-7
    + [0x75, 0x04, 0x95, 0x01, 0x81, 0x42, 0x65, 0x00, 0x75, 0x04, 0x95, 0x01, 0x81, 0x03]
    + [0x35, 0x00, 0x45, 0x00]  # physical range back to "same as logical" for the axes
    + [0x09, 0x30, 0x09, 0x31, 0x09, 0x33, 0x09, 0x34]  # X Y Rx Ry
    + [0x16, 0x00, 0x80, 0x26, 0xFF, 0x7F, 0x75, 0x10, 0x95, 0x04, 0x81, 0x02]
    + [0x09, 0x32, 0x09, 0x35, 0x15, 0x00, 0x26, 0xFF, 0x00, 0x75, 0x08, 0x95, 0x02, 0x81, 0x02]  # Z Rz
    + [0xC0]
)
# Hat value per (dx, dy) with dy -1 = up; 8 = centred (out of range = null).
_HAT = {(0, -1): 0, (1, -1): 1, (1, 0): 2, (1, 1): 3, (0, 1): 4, (-1, 1): 5, (-1, 0): 6, (-1, -1): 7}


class UhidGamepad:
    """Same interface as UinputGamepad (update / release_all / close / rumble_cb), backed by /dev/uhid."""

    def __init__(
        self,
        name: str = "NSO GameCube Controller",
        button_map=None,
        product: int = P.NSO_GAMECUBE_PID,
        mac: str = "",
    ):
        import os

        self.button_map = {k: v for k, v in (button_map or DEFAULT_BUTTON_MAP).items() if v in XPAD_KEYS}
        self.trigger_bits = TRIGGER_BITS["gc" if product == P.NSO_GAMECUBE_PID else "pro"]
        name = ("Switch 2 BT GC" if product == P.NSO_GAMECUBE_PID else "Switch 2 BT Pro") + (
            name[name.rindex(" (P"):] if " (P" in name else ""
        )
        self.rumble_cb: Optional[Callable[[float, float], None]] = None
        self._fd = os.open("/dev/uhid", os.O_RDWR | os.O_CLOEXEC | os.O_NONBLOCK)
        phys = (phys_for_mac(mac) if mac else "ngc/uhid").encode()[:63]
        uniq = (mac or name).encode()[:63]
        req = struct.pack(
            "<I128s64s64sHHIIII4096s",
            UHID_CREATE2,
            name.encode()[:127],
            phys,
            uniq,
            len(_REPORT_DESC),
            BUS_USB,
            XPAD_VENDOR,
            XPAD_PRODUCT,
            0x0110,
            0,
            _REPORT_DESC,
        )
        os.write(self._fd, req)
        self._last: bytes = b""
        logger.info("created virtual gamepad (uhid): %s", name)

    def _drain(self) -> None:
        """Discards the kernel's start / open / close notices so its event queue never fills."""
        import os

        try:
            while os.read(self._fd, 4380):
                pass
        except (BlockingIOError, OSError):
            pass

    def _send(self, report: bytes) -> None:
        import os

        if report == self._last:
            return
        self._last = report
        self._drain()
        os.write(self._fd, struct.pack("<IH", UHID_INPUT2, len(report)) + report)

    def update(
        self,
        buttons: int,
        left_stick: tuple[float, float],
        right_stick: tuple[float, float],
        left_trigger: int,
        right_trigger: int,
    ) -> None:
        bits = 0
        for switch_name, key_code in self.button_map.items():
            mask = P.SWITCH_BUTTONS.get(switch_name, 0)
            if mask and (buttons & mask):
                bits |= 1 << XPAD_KEYS.index(key_code)
        dx = (1 if buttons & P.SWITCH_BUTTONS["RIGHT"] else 0) - (1 if buttons & P.SWITCH_BUTTONS["LEFT"] else 0)
        dy = (1 if buttons & P.SWITCH_BUTTONS["DOWN"] else 0) - (1 if buttons & P.SWITCH_BUTTONS["UP"] else 0)
        tl, tr = (P.SWITCH_BUTTONS.get(b, 0) for b in self.trigger_bits)
        if tl and buttons & tl:
            left_trigger = 255
        if tr and buttons & tr:
            right_trigger = 255
        def s(v: float) -> int:
            return max(-32767, min(32767, int(v * 32767)))

        self._send(
            struct.pack(
                "<HBhhhhBB",
                bits,
                _HAT.get((dx, dy), 8),
                s(left_stick[0]),
                -s(left_stick[1]),
                s(right_stick[0]),
                -s(right_stick[1]),
                max(0, min(255, left_trigger)),
                max(0, min(255, right_trigger)),
            )
        )

    def release_all(self) -> None:
        self._send(struct.pack("<HBhhhhBB", 0, 8, 0, 0, 0, 0, 0, 0))

    def close(self) -> None:
        import os

        try:
            os.write(self._fd, struct.pack("<I", UHID_DESTROY))
        except OSError:
            pass
        try:
            os.close(self._fd)
        except OSError:
            pass


class SwitchGamepad:
    """A uhid pad (each controller its own gamepad in browsers), else uinput when /dev/uhid isn't usable."""

    def __new__(cls, *args, **kwargs):  # type: ignore[misc]
        try:
            return UhidGamepad(*args, **kwargs)
        except OSError as exc:
            logger.warning("uhid unavailable (%s); using uinput - browsers will only see one controller", exc)
            return UinputGamepad(*args, **kwargs)


GameCubeGamepad = SwitchGamepad
