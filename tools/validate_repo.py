#!/usr/bin/env python3
import hashlib
import json
import re
import sys
from pathlib import Path


SEMVER_RE = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")


def sha256_hex(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def err(msg: str) -> None:
    print(f"[ERROR] {msg}", file=sys.stderr)


def validate_json_file(path: Path) -> bool:
    try:
        json.loads(path.read_text(encoding="utf-8-sig"))
        return True
    except Exception as e:
        err(f"Invalid JSON: {path} ({e})")
        return False


def validate_manifest(manifest_path: Path) -> bool:
    ok = True
    plugin_dir = manifest_path.parent
    version_dir = plugin_dir.name
    plugin_id_dir = plugin_dir.parent.name

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    except Exception as e:
        err(f"Invalid JSON: {manifest_path} ({e})")
        return False

    if manifest.get("schemaVersion") != 1:
        err(f"{manifest_path}: schemaVersion must be 1")
        ok = False

    plugin_id = manifest.get("id")
    if not isinstance(plugin_id, str) or not plugin_id:
        err(f"{manifest_path}: id missing/invalid")
        ok = False
    elif plugin_id != plugin_id_dir:
        err(f"{manifest_path}: id '{plugin_id}' != folder '{plugin_id_dir}'")
        ok = False

    version = manifest.get("version")
    if not isinstance(version, str) or not SEMVER_RE.match(version):
        err(f"{manifest_path}: version invalid: {version!r}")
        ok = False
    elif version != version_dir:
        err(f"{manifest_path}: version '{version}' != folder '{version_dir}'")
        ok = False

    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        err(f"{manifest_path}: files missing/empty")
        return False

    seen_paths = set()
    for item in files:
        rel = item.get("path")
        if not isinstance(rel, str) or not rel:
            err(f"{manifest_path}: files[].path invalid")
            ok = False
            continue

        if rel.startswith(("/", "\\")) or ":" in rel.split("/")[0]:
            err(f"{manifest_path}: files[].path must be relative: {rel}")
            ok = False
        if ".." in Path(rel).parts:
            err(f"{manifest_path}: files[].path cannot contain '..': {rel}")
            ok = False

        norm = rel.replace("\\", "/")
        if norm in seen_paths:
            err(f"{manifest_path}: duplicate files[].path: {norm}")
            ok = False
        seen_paths.add(norm)

        full = (plugin_dir / norm).resolve()
        if not full.exists() or not full.is_file():
            err(f"{manifest_path}: missing file: {norm}")
            ok = False
            continue

        expected_size = item.get("size")
        if not isinstance(expected_size, int) or expected_size < 0:
            err(f"{manifest_path}: invalid size for {norm}")
            ok = False
        else:
            actual_size = full.stat().st_size
            if actual_size != expected_size:
                err(f"{manifest_path}: size mismatch for {norm}: {expected_size} != {actual_size}")
                ok = False

        expected_hash = item.get("sha256")
        if not isinstance(expected_hash, str) or not SHA256_RE.match(expected_hash):
            err(f"{manifest_path}: invalid sha256 for {norm}")
            ok = False
        else:
            actual_hash = sha256_hex(full)
            if actual_hash != expected_hash:
                err(f"{manifest_path}: sha256 mismatch for {norm}: {expected_hash} != {actual_hash}")
                ok = False

    # entry scripts must be listed in files[]
    entry = manifest.get("entry")
    if isinstance(entry, dict):
        for k, v in entry.items():
            if not isinstance(v, dict):
                continue
            script = v.get("script")
            if not isinstance(script, str):
                continue
            script_norm = script.replace("\\", "/")
            if script_norm not in seen_paths:
                err(f"{manifest_path}: entry.{k}.script not in files[]: {script_norm}")
                ok = False

    return ok


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]

    ok = True
    for fname in ["registry.json", "blocked.json"]:
        path = repo_root / fname
        if not path.exists():
            err(f"Missing file: {path}")
            ok = False
        else:
            ok = validate_json_file(path) and ok

    plugins_dir = repo_root / "plugins"
    if not plugins_dir.exists():
        err(f"Missing plugins dir: {plugins_dir}")
        return 1

    manifests = sorted(plugins_dir.glob("*/*/manifest.json"))
    if not manifests:
        err(f"No manifests found under: {plugins_dir}/<id>/<version>/manifest.json")
        ok = False

    for manifest_path in manifests:
        ok = validate_manifest(manifest_path) and ok

    if ok:
        print("OK")
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

