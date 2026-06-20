#!/usr/bin/env python3
"""把一个插件版本目录打包成 .ipk（zip），供 App「设置 → 插件 → +」安装。

用法:
    python tools/pack_plugin.py plugins/<id>/<version>/ [输出目录]

产物默认输出到 packages/<id>-<version>.ipk
.ipk 内部就是 zip：包根含 manifest.json + main.js（+ 可选 icon/assets/README）。
"""
import json
import sys
import zipfile
from pathlib import Path

# 固定时间戳：让重复打包的产物字节稳定，避免提交时产生无意义的 git 变更。
_FIXED_DATE = (2020, 1, 1, 0, 0, 0)


def pack(plugin_dir: Path, out_dir: Path) -> Path:
    """把 plugin_dir 打成 <id>-<version>.ipk 到 out_dir，返回产物路径。"""
    manifest_path = plugin_dir / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"找不到 manifest.json: {manifest_path}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    pid = manifest.get("id")
    ver = manifest.get("version")
    if not pid or not ver:
        raise ValueError(f"{manifest_path}: manifest 缺少 id / version")

    out_dir.mkdir(parents=True, exist_ok=True)
    ipk = out_dir / f"{pid}-{ver}.ipk"
    if ipk.exists():
        ipk.unlink()

    # 扁平打包目录内容（manifest.json 必须在包根）。
    with zipfile.ZipFile(ipk, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(plugin_dir.rglob("*")):
            if f.is_file():
                zi = zipfile.ZipInfo(
                    f.relative_to(plugin_dir).as_posix(), date_time=_FIXED_DATE
                )
                zi.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(zi, f.read_bytes())
    return ipk


def main():
    if len(sys.argv) < 2:
        print("用法: python tools/pack_plugin.py plugins/<id>/<version>/ [输出目录]", file=sys.stderr)
        return 2

    plugin_dir = Path(sys.argv[1]).resolve()
    out_dir = (
        Path(sys.argv[2])
        if len(sys.argv) > 2
        else (Path(__file__).resolve().parents[1] / "packages")
    )
    try:
        ipk = pack(plugin_dir, out_dir)
    except Exception as e:  # noqa: BLE001
        print(str(e), file=sys.stderr)
        return 1
    print(f"已生成: {ipk}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
