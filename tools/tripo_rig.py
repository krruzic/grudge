#!/usr/bin/env python3
import asyncio
import json
import os
import sys
from pathlib import Path

from tripo3d import TripoClient

ROOT = Path(__file__).resolve().parent.parent
GEN = ROOT / "assets" / "generated"
ALL = ["warlord", "engineer", "raider", "summoner", "duelist", "warden", "herald", "grunt", "ranged", "heavy"]


def env():
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))


async def done(client, task_id, label):
    task = await client.wait_for_task(task_id, verbose=False)
    status = getattr(task.status, "value", task.status)
    print(f"  {label}: {status}")
    if status != "success":
        raise RuntimeError(f"{label} {status}: {task}")
    return task


async def rig(client, name, spec, check_only, version):
    folder = GEN / f"{name}_ai"
    meta_path = folder / "rig.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    print(name)
    if not meta.get("import_task"):
        meta["import_task"] = await client.import_model(str(folder / "prepped.glb"))
        meta_path.write_text(json.dumps(meta, indent=2))
    await done(client, meta["import_task"], "import")
    check = await done(client, await client.check_riggable(meta["import_task"]), "prerigcheck")
    meta["riggable"] = check.output.riggable
    meta["rig_type"] = getattr(check.output.rig_type, "value", check.output.rig_type)
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"  riggable={meta['riggable']} type={meta['rig_type']}")
    if check_only or not meta["riggable"]:
        return
    rig_id = await client.rig_model(
        meta["import_task"], model_version=version, out_format="glb", rig_type=meta["rig_type"] or "biped", spec=spec
    )
    meta["rig_task"] = rig_id
    meta_path.write_text(json.dumps(meta, indent=2))
    await done(client, rig_id, "rig")
    files = await client.download_task_models(await client.get_task(rig_id), str(folder))
    for path in files.values():
        if path and path.endswith(".glb"):
            os.replace(path, folder / "rigged.glb")
    print(f"  wrote {folder / 'rigged.glb'}")


async def main():
    env()
    args = sys.argv[1:]
    spec = args[args.index("--spec") + 1] if "--spec" in args else "mixamo"
    version = args[args.index("--version") + 1] if "--version" in args else "v1.0-20240301"
    names = [a for a in args if a in ALL] or ALL
    async with TripoClient(api_key=os.environ["TRIPO_API_KEY"]) as client:
        bal = await client.get_balance()
        print(f"tripo balance {bal.balance} (frozen {bal.frozen})")
        for n in names:
            try:
                await rig(client, n, spec, "--check-only" in args, version)
            except Exception as e:
                print(f"  FAILED: {e}")


asyncio.run(main())
