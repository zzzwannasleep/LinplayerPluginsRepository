#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path


def sha256_hex(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def normalize_relpath(path: Path, base_dir: Path) -> str:
    rel = path.relative_to(base_dir)
    return rel.as_posix()


def should_include(path: Path, include_docs: bool) -> bool:
    if path.name.lower() == "manifest.json":
        return False
    if path.name.startswith("."):
        return False
    if path.suffix.lower() == ".md" and not include_docs:
        return False
    return path.is_file()


def scan_files(plugin_dir: Path, include_docs: bool) -> list[dict]:
    files = []
    for path in sorted(plugin_dir.rglob("*")):
        if not should_include(path, include_docs):
            continue
        files.append(
            {
                "path": normalize_relpath(path, plugin_dir),
                "size": path.stat().st_size,
                "sha256": sha256_hex(path),
            }
        )
    return files


def update_existing_files(plugin_dir: Path, manifest: dict) -> list[dict]:
    updated = []
    for item in manifest.get("files", []):
        rel = item.get("path")
        if not rel or not isinstance(rel, str):
            raise SystemExit("manifest.files[] 中存在无效 path")
        path = (plugin_dir / rel).resolve()
        if not path.exists():
            raise SystemExit(f"文件不存在：{rel}")
        if not path.is_file():
            raise SystemExit(f"不是文件：{rel}")
        updated.append(
            {
                "path": rel.replace("\\", "/"),
                "size": path.stat().st_size,
                "sha256": sha256_hex(path),
            }
        )
    updated.sort(key=lambda x: x["path"])
    return updated


def main() -> None:
    parser = argparse.ArgumentParser(description="更新插件 manifest.json 的 files[].size/sha256。")
    parser.add_argument("plugin_dir", help="插件版本目录，例如 plugins/<id>/<version>/")
    parser.add_argument("--scan", action="store_true", help="扫描目录生成 files[]（默认仅更新已有 files[]）")
    parser.add_argument("--include-docs", action="store_true", help="扫描时包含 .md 文件")
    args = parser.parse_args()

    plugin_dir = Path(args.plugin_dir).resolve()
    manifest_path = plugin_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"未找到：{manifest_path}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    if args.scan:
        manifest["files"] = scan_files(plugin_dir, include_docs=args.include_docs)
    else:
        if "files" not in manifest:
            raise SystemExit("manifest.json 缺少 files 字段，建议使用 --scan 生成。")
        manifest["files"] = update_existing_files(plugin_dir, manifest)

    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"OK: updated {manifest_path}")


if __name__ == "__main__":
    main()

