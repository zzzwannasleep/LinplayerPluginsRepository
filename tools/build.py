#!/usr/bin/env python3
"""一键构建插件仓库。

以各插件的 manifest.json 为**唯一元数据源**：
  ① 轻量校验(目录名/入口文件一致)；
  ② 自动生成 registry.json(市场索引,无需手工维护)；
  ③ 把所有插件版本打包成 packages/<id>-<version>.ipk(供市场直接下载、App 安装)。

用法:
    python tools/build.py

写好 plugins/<id>/<version>/{manifest.json, main.js} 后跑本脚本即可，
registry.json 与 packages/*.ipk 都会被重新生成，然后提交。
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from pack_plugin import pack  # noqa: E402

# registry 里 manifestUrl / packageUrl 用绝对地址(raw)，App 与市场页都能直接取。
RAW_BASE = "https://raw.githubusercontent.com/zzzwannasleep/LinplayerPluginsRepository/main"

_DEFAULTS = {
    "channel": "stable",
    "apiVersion": 1,
    "minHostVersion": "1.0.0",
    "targets": ["pc", "mobile", "tv"],
    "tags": [],
}


def _author(m):
    a = m.get("author")
    if isinstance(a, dict):
        return a
    if isinstance(a, str) and a:
        return {"name": a}
    return {"name": "Unknown"}


def main():
    plugins_dir = ROOT / "plugins"
    manifests = sorted(plugins_dir.glob("*/*/manifest.json"))
    if not manifests:
        print("plugins/<id>/<version>/manifest.json 下没有任何插件", file=sys.stderr)
        return 1

    errors = []
    by_id = {}  # id -> {"meta": <最新 manifest>, "versions": [(ver, manifest, dir), ...]}
    for mp in manifests:
        try:
            m = json.loads(mp.read_text(encoding="utf-8-sig"))
        except Exception as e:  # noqa: BLE001
            errors.append(f"{mp}: 非法 JSON ({e})")
            continue
        pid, ver = m.get("id"), m.get("version")
        id_dir, ver_dir = mp.parent.parent.name, mp.parent.name
        if pid != id_dir:
            errors.append(f"{mp}: id '{pid}' 与目录 '{id_dir}' 不一致")
        if ver != ver_dir:
            errors.append(f"{mp}: version '{ver}' 与目录 '{ver_dir}' 不一致")
        if m.get("runtime", "js") == "js":
            entry_js = m.get("main", "main.js")
            if not (mp.parent / entry_js).is_file():
                errors.append(f"{mp}: 入口文件不存在: {entry_js}")
        e = by_id.setdefault(pid, {"meta": m, "versions": []})
        e["meta"] = m  # 用最后(最新版本目录)的展示元数据
        e["versions"].append((ver, m, mp.parent))

    if errors:
        for x in errors:
            print(f"[ERROR] {x}", file=sys.stderr)
        print(f"\n{len(errors)} 个错误，已中止。", file=sys.stderr)
        return 1

    # ① 生成 registry.json
    reg_plugins = []
    for pid, e in sorted(by_id.items()):
        meta = e["meta"]
        versions = []
        for ver, m, _ in sorted(e["versions"], key=lambda t: t[0]):
            versions.append({
                "version": ver,
                "channel": m.get("channel", _DEFAULTS["channel"]),
                "apiVersion": m.get("apiVersion", _DEFAULTS["apiVersion"]),
                "minHostVersion": m.get("minHostVersion")
                or m.get("minAppVersion")
                or _DEFAULTS["minHostVersion"],
                "manifestUrl": f"{RAW_BASE}/plugins/{pid}/{ver}/manifest.json",
                "packageUrl": f"{RAW_BASE}/packages/{pid}-{ver}.ipk",
            })
        entry = {
            "id": pid,
            "name": meta.get("name", pid),
            "description": meta.get("description", ""),
            "author": _author(meta),
            "tags": meta.get("tags", _DEFAULTS["tags"]),
            "targets": meta.get("targets", _DEFAULTS["targets"]),
            "runtime": meta.get("runtime", "js"),
            "versions": versions,
        }
        # addon 插件把 baseUrl 抬到索引，市场/App 无需下包即可知道服务地址。
        if meta.get("runtime") == "addon" and isinstance(meta.get("addon"), dict):
            entry["addonBaseUrl"] = meta["addon"].get("baseUrl")
        reg_plugins.append(entry)

    registry = {
        "schemaVersion": 1,
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "plugins": reg_plugins,
    }
    (ROOT / "registry.json").write_text(
        json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"registry.json 已生成：{len(reg_plugins)} 个插件")

    # ② 打包所有版本到 packages/
    out_dir = ROOT / "packages"
    n = 0
    for pid, e in by_id.items():
        for ver, _m, pdir in e["versions"]:
            ipk = pack(pdir, out_dir)
            print(f"  打包 {ipk.name}")
            n += 1
    print(f"完成：{n} 个 .ipk → packages/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
