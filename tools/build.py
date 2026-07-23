#!/usr/bin/env python3
"""一键构建插件仓库（v2）。

以各插件的 manifest.json 为**唯一元数据源**：
  ① 用 validate_repo 的同一套规则校验（不通过就中止，不产出半成品）；
  ② 打包 packages/<id>-<version>.ipk 并算 sha256；
  ③ 生成 registry.json（市场索引，无需手工维护）。

用法:
    python tools/build.py            # 构建
    python tools/build.py --check    # 只检查产物是否已是最新（CI 用，不写文件）

写好 plugins/<id>/<version>/{manifest.json, main.js} 后跑一次，然后提交
registry.json 和 packages/*.ipk。

── 两个刻意的设计 ─────────────────────────────────────────────────────
**仓库地址不写死。** 从 GITHUB_REPOSITORY（Actions 自带）或 git remote 推导；
两个都拿不到就**报错中止**，绝不退回一个猜测的默认值 —— 猜错的后果是产出一份
package_url 全部 404 的 registry，而它长得完全正常。

**产物必须可复现。** 同样的插件源码跑两次，registry.json 和 .ipk 都是逐字节相同：
registry 里没有任何时间戳（理由见下面 icon_data_uri 后面那段），.ipk 的时间戳和
权限位在 pack_plugin 里钉死。这样 `--check` 才能用「重跑一遍看有没有 diff」来判断产物是否过期。
──────────────────────────────────────────────────────────────────────
"""
import base64
import json
import mimetypes
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from pack_plugin import pack, sha256_of  # noqa: E402
from validate_repo import Report, validate_manifest  # noqa: E402


def _git(*args):
    try:
        out = subprocess.run(
            ["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=15
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return out.stdout.strip() if out.returncode == 0 else ""


def repo_slug():
    """owner/repo。CI 里直接给，本地从 git remote 推。推不出来就是错误。"""
    slug = os.environ.get("GITHUB_REPOSITORY", "").strip()
    if slug:
        return slug
    url = _git("remote", "get-url", "origin")
    # 支持 https://github.com/o/r(.git) 和 git@github.com:o/r(.git)
    for sep in ("github.com/", "github.com:"):
        if sep in url:
            tail = url.split(sep, 1)[1]
            return tail[:-4] if tail.endswith(".git") else tail
    return ""


def raw_base():
    slug = repo_slug()
    if not slug:
        raise SystemExit(
            "无法确定仓库地址：GITHUB_REPOSITORY 未设置，且 git remote origin 不是 GitHub 地址。\n"
            "手动指定：GITHUB_REPOSITORY=owner/repo python tools/build.py"
        )
    ref = os.environ.get("LP_REGISTRY_REF", "main")
    # 分发通道口径见 docs/PLUGINS_V2_PLAN.md：registry 与 .ipk 都走 GitHub raw，
    # 不要「优化」到 Cloudflare —— 国内 CF 有地方会被阻断，GitHub 反而更稳。
    return f"https://raw.githubusercontent.com/{slug}/{ref}"


def icon_data_uri(plugin_dir, icon_name):
    """把图标压成 data URI 内联进 registry。

    卡片因此永远不碎图、零额外请求，也不受图床可达性影响 —— 而图床可达性正是
    国内网络最不可预测的一环。代价是索引变大，所以校验器对图标有体积上限。
    """
    if not icon_name:
        return None
    p = plugin_dir / icon_name
    if not p.is_file():
        return None
    mime = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
    if p.suffix.lower() == ".svg":
        mime = "image/svg+xml"
    return f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode('ascii')}"


#
# 【没有 published_at / updatedAt，这是故意的】
#
# 试过两种发布时间的来源，都不行：
#   - datetime.now()：每次 build 都刷新，registry.json 永远带一行无意义的 diff，
#     也让「重跑一遍看有没有变化」这种产物新鲜度检查失效；
#   - git 提交时间：新插件第一次提交时它的目录还不在历史里，取不到值；等提交完
#     再跑 --check 就变成「不一致」，逼人为了一个时间戳再提交一次。
#
# 而这个字段的全部用途只是市场页上显示一行「更新于」。用版本号代替它，
# 少一个会说谎的活动部件。宿主本来就不读这两个字段。
#


def collect():
    """扫描 + 校验，返回 {id: [(version, manifest, dir), ...]}。校验不过直接退出。"""
    manifests = sorted((ROOT / "plugins").glob("*/*/manifest.json"))
    if not manifests:
        raise SystemExit("plugins/<id>/<version>/manifest.json 下没有任何插件")

    rep = Report()
    by_id = {}
    for mp in manifests:
        where = str(mp.relative_to(ROOT)).replace("\\", "/")
        try:
            m = json.loads(mp.read_text(encoding="utf-8-sig"))
        except Exception as e:  # noqa: BLE001
            rep.err(where, f"非法 JSON ({e})")
            continue
        validate_manifest(
            m, rep, where,
            plugin_dir=mp.parent,
            id_dir=mp.parent.parent.name,
            ver_dir=mp.parent.name,
        )
        by_id.setdefault(m.get("id"), []).append((m.get("version"), m, mp.parent))

    if rep.dump():
        raise SystemExit(f"\n{len(rep.errors)} 个错误，已中止（没有产出任何文件）。")
    return by_id


def build_registry(by_id, base, pack_files):
    """生成 registry 结构。pack_files=True 时顺便打包并算 sha256。"""
    out_dir = ROOT / "packages"
    plugins = []

    for pid in sorted(by_id):
        versions_src = sorted(by_id[pid], key=lambda t: [int(x) for x in t[0].split(".")[:3]])
        # 展示元数据取最新那一版 —— 名称/描述/图标改了要能立刻反映到市场。
        _, meta, meta_dir = versions_src[-1]

        versions = []
        for ver, m, pdir in versions_src:
            entry = {
                # ★ 键名是 **snake_case**。宿主的 RegistryVersion 没有 rename_all，
                #   写成 camelCase 的话 serde 会静默忽略 —— v1 的 packageUrl 就是
                #   这么让整条插件被跳过的。
                "version": ver,
                "api_version": m.get("apiVersion", 2),
                "package_url": f"{base}/packages/{pid}-{ver}.ipk",
            }
            if m.get("minAppVersion"):
                entry["min_app_version"] = m["minAppVersion"]
            log = (pdir / "CHANGELOG.md").read_text(encoding="utf-8-sig").strip() if (pdir / "CHANGELOG.md").is_file() else ""
            if log:
                entry["changelog"] = log
            if pack_files:
                ipk = pack(pdir, out_dir)
                entry["sha256"] = sha256_of(ipk)
                print(f"  打包 {ipk.name}  {entry['sha256'][:12]}…")
            versions.append(entry)

        item = {
            "id": pid,
            "name": meta.get("name", pid),
            "description": meta.get("description", ""),
            # ★ 字符串，不是 {"name": …}。见 validate_repo 里的说明。
            "author": meta.get("author", "未知作者"),
            "category": meta.get("category", "tools"),
            "tags": meta.get("tags", []),
            "targets": meta.get("targets", []),
            # 权限摘要上移到索引：市场页**不下载包**就能把权限逐条列给用户看。
            "permissions": meta.get("permissions", []),
            "versions": versions,
        }
        icon = icon_data_uri(meta_dir, meta.get("icon"))
        if icon:
            item["icon"] = icon
        if meta.get("contributes"):
            item["contributes"] = meta["contributes"]
        if meta.get("homepage"):
            item["homepage"] = meta["homepage"]
        plugins.append(item)

    return {"schemaVersion": 2, "plugins": plugins}


def serialize(registry):
    return json.dumps(registry, ensure_ascii=False, indent=2) + "\n"


def write_text_lf(path, text):
    """写文件，行尾**强制 LF**。

    Path.write_text 默认把换行翻译成 os.linesep —— 在 Windows 上就是 CRLF。
    于是同一份插件在 Windows 上生成的 registry.json 和在 Linux 上生成的字节不同，
    「重跑一遍看有没有 diff」这个产物新鲜度检查跨平台永远过不了。
    症状还是本地一切正常、只有 CI 红 —— 最难查的那一种。
    """
    path.write_text(text, encoding="utf-8", newline="\n")


def main():
    check_only = "--check" in sys.argv
    by_id = collect()
    base = raw_base()
    print(f"仓库地址: {base}")

    if check_only:
        # 不打包（打包会写 packages/），只比对 registry 的非 sha256 部分。
        want = build_registry(by_id, base, pack_files=False)
        have = json.loads((ROOT / "registry.json").read_text(encoding="utf-8-sig"))
        strip = lambda r: [  # noqa: E731
            {**p, "versions": [{k: v for k, v in ver.items() if k != "sha256"} for ver in p["versions"]]}
            for p in r["plugins"]
        ]
        if strip(want) != strip(have):
            print("registry.json 与 plugins/ 不一致 —— 改完插件忘了跑 tools/build.py？", file=sys.stderr)
            return 1
        print("registry.json 是最新的")
        return 0

    registry = build_registry(by_id, base, pack_files=True)
    write_text_lf(ROOT / "registry.json", serialize(registry))
    n_ver = sum(len(p["versions"]) for p in registry["plugins"])
    print(f"registry.json 已生成：{len(registry['plugins'])} 个插件 / {n_ver} 个版本")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
