#!/usr/bin/env python3
"""校验插件仓库与 App 插件格式（lib/plugins）一致。无第三方依赖。"""
import json
import re
import sys
from pathlib import Path

ID_RE = re.compile(r"^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$")
SEMVER_RE = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")

KNOWN_PERMS = {
    "player.read", "player.control", "http", "storage", "ui",
    "emby.read", "emby.api", "emby.credentials", "extensions", "cfproxy", "log",
}
KNOWN_EXT_POINTS = {
    "sidebarItems", "mediaSources", "actions", "eventListeners",
    "settingsPages", "playerOverlays", "contextMenus", "homeStats",
}

errors = []


def err(msg):
    errors.append(msg)
    print(f"[ERROR] {msg}", file=sys.stderr)


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception as e:
        err(f"非法 JSON: {path} ({e})")
        return None


def validate_manifest(manifest_path):
    plugin_dir = manifest_path.parent
    version_dir = plugin_dir.name
    id_dir = plugin_dir.parent.name

    m = load_json(manifest_path)
    if m is None:
        return

    pid = m.get("id")
    if not isinstance(pid, str) or not ID_RE.match(pid or ""):
        err(f"{manifest_path}: id 缺失或非反向域名格式: {pid!r}")
    elif pid != id_dir:
        err(f"{manifest_path}: id '{pid}' 与目录名 '{id_dir}' 不一致")

    ver = m.get("version")
    if not isinstance(ver, str) or not SEMVER_RE.match(ver or ""):
        err(f"{manifest_path}: version 非语义化: {ver!r}")
    elif ver != version_dir:
        err(f"{manifest_path}: version '{ver}' 与目录名 '{version_dir}' 不一致")

    for field in ("name", "description"):
        if not isinstance(m.get(field), str) or not m.get(field):
            err(f"{manifest_path}: 缺少字段 {field}")

    if "author" in m and not isinstance(m["author"], str):
        err(f"{manifest_path}: author 必须是字符串")

    perms = m.get("permissions")
    if not isinstance(perms, list):
        err(f"{manifest_path}: permissions 必须是数组")
    else:
        for p in perms:
            if p not in KNOWN_PERMS:
                err(f"{manifest_path}: 未知权限 {p!r}")

    hosts = m.get("httpAllowedHosts")
    if hosts is not None and not isinstance(hosts, list):
        err(f"{manifest_path}: httpAllowedHosts 必须是数组")

    ext = m.get("extends")
    if ext is not None:
        if not isinstance(ext, dict):
            err(f"{manifest_path}: extends 必须是对象")
        else:
            for k in ext:
                if k not in KNOWN_EXT_POINTS:
                    err(f"{manifest_path}: 未知扩展点 {k!r}")

    # 入口文件存在
    main = m.get("main") or "main.js"
    if not (plugin_dir / main).is_file():
        err(f"{manifest_path}: 入口文件不存在: {main}")

    # 图标存在（若声明）
    icon = m.get("icon")
    if isinstance(icon, str) and icon and not (plugin_dir / icon).is_file():
        err(f"{manifest_path}: 图标文件不存在: {icon}")


def main():
    root = Path(__file__).resolve().parents[1]

    for fname in ("registry.json", "blocked.json"):
        p = root / fname
        if not p.exists():
            err(f"缺少文件: {p}")
        else:
            load_json(p)

    plugins_dir = root / "plugins"
    manifests = sorted(plugins_dir.glob("*/*/manifest.json"))
    if not manifests:
        err("plugins/<id>/<version>/manifest.json 下没有任何插件")
    for mp in manifests:
        validate_manifest(mp)

    # registry 与目录一致性
    reg = load_json(root / "registry.json") or {}
    reg_ids = {p.get("id") for p in reg.get("plugins", []) if isinstance(p, dict)}
    folder_ids = {mp.parent.parent.name for mp in manifests}
    for fid in folder_ids - reg_ids:
        err(f"registry.json 缺少插件条目: {fid}")
    for rid in reg_ids - folder_ids:
        err(f"registry.json 列出的插件没有目录: {rid}")

    if errors:
        print(f"\n{len(errors)} 个错误", file=sys.stderr)
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
