#!/usr/bin/env python3
"""一键校验 + 打包整个插件仓库：把每个 plugins/<id>/<version>/ 打成 dist/<id>-<version>.lpk。

用法:
    python tools/build_all.py

流程：① 先跑 validate_repo.py 校验(manifest 格式、目录名一致、registry 同步等)；
校验通过后 ② 逐个调用 pack_plugin.py 打包所有插件版本到 dist/。
任一环节失败即中止并返回非零退出码(方便 CI 用)。
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"


def main():
    print("== ① 校验仓库 ==")
    r = subprocess.run([sys.executable, str(TOOLS / "validate_repo.py")])
    if r.returncode != 0:
        print("校验未通过，已中止打包。", file=sys.stderr)
        return r.returncode

    print("\n== ② 打包所有插件 ==")
    manifests = sorted((ROOT / "plugins").glob("*/*/manifest.json"))
    if not manifests:
        print("没有发现任何插件 (plugins/<id>/<version>/manifest.json)。", file=sys.stderr)
        return 1

    packed = 0
    for mp in manifests:
        r = subprocess.run([sys.executable, str(TOOLS / "pack_plugin.py"), str(mp.parent)])
        if r.returncode != 0:
            print(f"打包失败: {mp.parent}", file=sys.stderr)
            return r.returncode
        packed += 1

    print(f"\n完成：{packed} 个插件版本已打包到 dist/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
