#!/usr/bin/env python3
"""把一个插件版本目录打包成 .lpk（zip），供 App「设置 → 插件 → +」安装。

用法:
    python tools/pack_plugin.py plugins/<id>/<version>/ [输出目录]

产物默认输出到 dist/<id>-<version>.lpk
"""
import json
import sys
import zipfile
from pathlib import Path


def main():
    if len(sys.argv) < 2:
        print("用法: python tools/pack_plugin.py plugins/<id>/<version>/ [输出目录]", file=sys.stderr)
        return 2

    plugin_dir = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else (Path(__file__).resolve().parents[1] / "dist")

    manifest_path = plugin_dir / "manifest.json"
    if not manifest_path.is_file():
        print(f"找不到 manifest.json: {manifest_path}", file=sys.stderr)
        return 1

    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    pid = manifest.get("id")
    ver = manifest.get("version")
    if not pid or not ver:
        print("manifest 缺少 id / version", file=sys.stderr)
        return 1

    out_dir.mkdir(parents=True, exist_ok=True)
    lpk = out_dir / f"{pid}-{ver}.lpk"
    if lpk.exists():
        lpk.unlink()

    # 扁平打包目录内容（manifest.json 必须在包根）
    with zipfile.ZipFile(lpk, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(plugin_dir.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(plugin_dir).as_posix())

    print(f"已生成: {lpk}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
