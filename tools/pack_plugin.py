#!/usr/bin/env python3
"""把一个插件版本目录打包成 .ipk，供 App「插件 → 安装本地插件」使用。

用法:
    python tools/pack_plugin.py plugins/<id>/<version>/ [输出目录]

.ipk 就是 zip：包根必须含 manifest.json，以及 manifest.main 指向的入口 js。
宿主按 `by_name("manifest.json")` 直接取（`crates/core/src/plugins/installer.rs`），
所以**不能**在外面多包一层目录。
"""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

# 固定时间戳 + 固定顺序 + 固定权限位 = 同样的输入永远产出同样的字节。
#
# 这不只是「避免无意义的 git 变更」——v2 的 registry.json 里带 sha256。
# 打包不可复现的话，每次 build 都会算出一份新哈希，等于每次发布都在改所有插件的
# 校验和，谁也分不清是插件内容真的变了、还是打包器自己在抖。
_FIXED_DATE = (2020, 1, 1, 0, 0, 0)

# 不进包的东西。README 要进（App 详情页读它），CHANGELOG 只进 registry 不进包。
_SKIP_NAMES = {".DS_Store", "Thumbs.db", "CHANGELOG.md"}
_SKIP_DIRS = {"__pycache__", ".git"}


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

    files = [
        f
        for f in sorted(plugin_dir.rglob("*"))
        if f.is_file()
        and f.name not in _SKIP_NAMES
        and not any(part in _SKIP_DIRS for part in f.relative_to(plugin_dir).parts)
    ]

    with zipfile.ZipFile(ipk, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in files:
            zi = zipfile.ZipInfo(f.relative_to(plugin_dir).as_posix(), date_time=_FIXED_DATE)
            zi.compress_type = zipfile.ZIP_DEFLATED
            # 权限位要钉死，否则 Windows 和 Linux 打出来的包字节不同 → sha256 不同。
            zi.external_attr = 0o644 << 16
            # ★ create_system 也必须钉死。ZipInfo 默认按当前平台填（Windows=0、Unix=3），
            #   这一个字节写进 zip 中央目录，于是同样的源码在两个平台上产出不同的
            #   sha256。症状是本地 build 一切正常、CI 的「产物一致性」检查红，
            #   而 diff 里只有一串哈希在变，看不出任何线索。统一按 Unix。
            zi.create_system = 3
            z.writestr(zi, f.read_bytes())
    return ipk


def sha256_of(path: Path) -> str:
    """.ipk 的 sha256（小写十六进制）。写进 registry，App 下载后逐字节校验。"""
    return hashlib.sha256(path.read_bytes()).hexdigest()


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
    print(f"sha256: {sha256_of(ipk)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
