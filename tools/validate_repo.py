#!/usr/bin/env python3
"""校验插件仓库符合 LinPlayer 插件 **v2** 规范。无第三方依赖。

    python tools/validate_repo.py            # 校验仓库
    python tools/validate_repo.py --selftest # 自检：确认校验器真的会红

═══════════════════════════════════════════════════════════════════════
本文件是宿主校验规则的**手抄副本**。两边漂移的后果是最难查的那种：
CI 全绿、用户装进 App 却被拒。所以——

  ① 所有常量集中在下面 HOST CONTRACT 一段里，每条都标了 Rust 源文件；
  ② 改动 v2 规范时，**先改 Rust 再抄过来**，不要反过来；
  ③ 真正的验收永远是「把 build 出来的包装进真 App」，CI 绿不算。
═══════════════════════════════════════════════════════════════════════
"""
import json
import re
import sys
from pathlib import Path

# ════════════════════ HOST CONTRACT（抄自宿主，勿凭记忆改）════════════════════

# crates/core/src/plugins/manifest.rs :: API_VERSION
API_VERSION = 2

# crates/core/src/plugins/permission.rs :: ALL
KNOWN_PERMS = {
    "player.read", "player.control", "http", "storage", "ui",
    "emby.read", "emby.api", "sources", "extensions", "sandbox", "log",
}
# crates/core/src/plugins/permission.rs :: REMOVED —— 撞上要给人话，不是「未知权限」
REMOVED_PERMS = {
    "emby.credentials": "宿主不再保存登录密码；请改为在插件自己的设置页里让用户填写",
    "cfproxy": "CF 优选反代已改为应用内置功能，不再经由插件",
}
# crates/core/src/plugins/manifest.rs :: CATEGORIES / TARGETS
CATEGORIES = {"source", "ui", "player", "notify", "tools"}
TARGETS = {"pc", "mobile", "tv"}

# crates/core/src/plugins/contributions.rs
#   ContributionKind::id() / required_permission() / PANEL_SLOTS / ACTION_CONTEXTS
CONTRIB_PERM = {
    "dataSources": "sources",
    "panels": "extensions",
    "actions": "extensions",
    "sandboxViews": "sandbox",
}
PANEL_SLOTS = {"home.stats", "sidebar", "settings", "player.overlay", "page"}
ACTION_CONTEXTS = {"global", "item", "player"}

# crates/core/src/plugins/manifest.rs :: TOKEN_SOURCE_SERVER
TOKEN_SOURCE_SERVER = "$sourceServer"

# v1 遗留字段。宿主撞上直接整包拒（不是忽略），所以这里也必须是错误。
V1_DEAD_FIELDS = {
    "runtime": "v1 的 iOS 合规运行时已删除",
    "extends": "v1 的 8 个平级扩展点已改为 contributes 四类 × slot",
    "data": "v1 的 runtime=data 声明式插件已删除",
    "addon": "v1 的 runtime=addon 远端插件已删除",
    "minHostVersion": "已改名为 minAppVersion",
    "channel": "v2 不再有 stable/beta 通道概念",
}

# ══════════════════════════════════════════════════════════════════════════════

ID_RE = re.compile(r"^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$")
SEMVER_RE = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$")

# 图标要被 build.py 压成 data URI 内联进 registry.json。太大的话每个用户每次刷新
# 市场都要多背这些字节 —— 内联的代价是它跟着索引走，省不掉。
MAX_ICON_BYTES = 64 * 1024


class Report:
    def __init__(self):
        self.errors = []

    def err(self, where, msg):
        self.errors.append(f"{where}: {msg}")

    def dump(self):
        for e in self.errors:
            print(f"[ERROR] {e}", file=sys.stderr)
        return len(self.errors)


def _items(val):
    """contributes.<kind> 允许单个对象或数组（宿主 parse_contributions 同款）。"""
    return val if isinstance(val, list) else [val]


def validate_manifest(m, rep, where, plugin_dir=None, id_dir=None, ver_dir=None):
    """校验一份 manifest。plugin_dir 为 None 时跳过文件存在性检查（供自检用）。"""
    if not isinstance(m, dict):
        rep.err(where, "manifest 必须是一个 JSON 对象")
        return

    # ---- 身份 ----
    pid = m.get("id")
    if not isinstance(pid, str) or not ID_RE.match(pid or ""):
        rep.err(where, f"id 缺失或不是反向域名格式（如 com.example.foo）: {pid!r}")
    elif id_dir is not None and pid != id_dir:
        rep.err(where, f"id '{pid}' 与目录名 '{id_dir}' 不一致")

    ver = m.get("version")
    if not isinstance(ver, str) or not SEMVER_RE.match(ver or ""):
        rep.err(where, f"version 必须是 x.y.z: {ver!r}")
    elif ver_dir is not None and ver != ver_dir:
        rep.err(where, f"version '{ver}' 与目录名 '{ver_dir}' 不一致")

    for field in ("name", "description"):
        if not isinstance(m.get(field), str) or not m.get(field, "").strip():
            rep.err(where, f"缺少字段 {field}")

    # author 必须是**字符串**。v1 是 {"name": ...} 对象 —— 这条差异让 v2 宿主
    # 反序列化整条失败并**静默跳过**，官方源 8 个插件曾因此在市场里全部消失。
    if "author" in m and not isinstance(m["author"], str):
        rep.err(where, "author 必须是字符串（v1 的 {\"name\": …} 对象形式会让宿主整条跳过）")

    # ---- v2 门禁 ----
    api = m.get("apiVersion")
    if api != API_VERSION:
        rep.err(where, f"apiVersion 必须是 {API_VERSION}，当前 {api!r}（缺省视为 1，会被宿主拒绝）")
    for dead, why in V1_DEAD_FIELDS.items():
        if dead in m:
            rep.err(where, f"含已废弃的 v1 字段 {dead!r}：{why}")

    # ---- 权限 ----
    perms = m.get("permissions", [])
    if not isinstance(perms, list):
        rep.err(where, "permissions 必须是数组")
        perms = []
    else:
        for p in perms:
            if not isinstance(p, str):
                rep.err(where, f"permissions 元素必须是字符串: {p!r}")
            elif p in REMOVED_PERMS:
                rep.err(where, f"权限「{p}」在 v2 已移除：{REMOVED_PERMS[p]}")
            elif p not in KNOWN_PERMS:
                rep.err(where, f"未知权限: {p}")
    perm_set = {p for p in perms if isinstance(p, str)}

    # ---- 分类 / 目标端 ----
    cat = m.get("category", "tools")
    if cat not in CATEGORIES:
        rep.err(where, f"未知分类 {cat!r}（可选 {' / '.join(sorted(CATEGORIES))}）")
    targets = m.get("targets", [])
    if not isinstance(targets, list):
        rep.err(where, "targets 必须是数组")
    else:
        for t in targets:
            if t not in TARGETS:
                rep.err(where, f"未知目标端 {t!r}（可选 {' / '.join(sorted(TARGETS))}；ios 已彻底不做）")

    # ---- 贡献点 ----
    contributes = m.get("contributes")
    if contributes is not None:
        if not isinstance(contributes, dict):
            rep.err(where, "contributes 必须是对象")
        else:
            for kind, val in contributes.items():
                if kind not in CONTRIB_PERM:
                    rep.err(where, f"未知贡献点类型 {kind!r}（可选 {' / '.join(CONTRIB_PERM)}）")
                    continue
                need = CONTRIB_PERM[kind]
                if need not in perm_set:
                    rep.err(where, f"contributes.{kind} 需要声明权限「{need}」，但 permissions 里没有")
                for item in _items(val):
                    _validate_contribution(kind, item, rep, where, plugin_dir)

    # ---- 出网白名单 ----
    hosts = m.get("httpAllowedHosts", [])
    if not isinstance(hosts, list):
        rep.err(where, "httpAllowedHosts 必须是数组")
        hosts = []
    for h in hosts:
        if not isinstance(h, str):
            rep.err(where, f"httpAllowedHosts 元素必须是字符串: {h!r}")
            continue
        h = h.strip()
        if h.startswith("$") and h != TOKEN_SOURCE_SERVER:
            rep.err(where, f"httpAllowedHosts 含未知令牌 {h!r}（目前只支持 {TOKEN_SOURCE_SERVER}）")
        elif h == "*":
            # 宿主容忍它但**永远匹配不上**（host_allowed 只认 "*." 开头）。
            # 放行的话作者会以为自己开了全网，实际是 fail-closed 全拒 —— 在这里拦住。
            rep.err(where, "httpAllowedHosts 不能用裸 '*'；子域通配写成 '*.example.com'")
        elif h.startswith("*") and not h.startswith("*."):
            rep.err(where, f"通配只支持 '*.example.com' 形式: {h!r}")
    if "http" in perm_set and not hosts:
        rep.err(where, "声明了 http 权限却没有 httpAllowedHosts —— 白名单为空等于拒绝一切出网")
    if hosts and "http" not in perm_set:
        rep.err(where, "有 httpAllowedHosts 却没声明 http 权限，插件发不出任何请求")

    # ---- 文件存在性 ----
    if plugin_dir is not None:
        main = m.get("main") or "main.js"
        if not (plugin_dir / main).is_file():
            rep.err(where, f"入口文件不存在: {main}")
        icon = m.get("icon")
        if isinstance(icon, str) and icon:
            ip = plugin_dir / icon
            if not ip.is_file():
                rep.err(where, f"图标文件不存在: {icon}")
            elif ip.stat().st_size > MAX_ICON_BYTES:
                rep.err(where, f"图标过大（{ip.stat().st_size} 字节 > {MAX_ICON_BYTES}）；它会被内联进 registry.json")


def _validate_contribution(kind, item, rep, where, plugin_dir):
    if not isinstance(item, dict):
        rep.err(where, f"contributes.{kind} 的每一条都必须是对象")
        return
    cid = str(item.get("id", "")).strip()
    if not cid:
        rep.err(where, f"contributes.{kind} 的每一条都必须有非空 id")
        return

    if kind == "panels":
        slot = item.get("slot")
        if slot not in PANEL_SLOTS:
            rep.err(where, f"panels[{cid}] 的 slot 非法: {slot!r}（可选 {' / '.join(sorted(PANEL_SLOTS))}）")
    elif kind == "actions":
        cx = item.get("context", "global")
        if cx not in ACTION_CONTEXTS:
            rep.err(where, f"actions[{cid}] 的 context 非法: {cx!r}（可选 {' / '.join(sorted(ACTION_CONTEXTS))}）")
    elif kind == "sandboxViews":
        entry = str(item.get("entry", "")).strip()
        if not entry:
            rep.err(where, f"sandboxViews[{cid}] 必须指定 entry（插件内的 html 文件）")
        elif ".." in entry or entry.startswith("/") or entry.startswith("\\"):
            rep.err(where, f"sandboxViews[{cid}] 的 entry 必须是插件目录内的相对路径: {entry!r}")
        elif plugin_dir is not None and not (plugin_dir / entry).is_file():
            rep.err(where, f"sandboxViews[{cid}] 的 entry 文件不存在: {entry}")
    elif kind == "dataSources":
        auth = item.get("auth")
        if auth is not None:
            fields = auth.get("fields") if isinstance(auth, dict) else None
            if not isinstance(fields, list):
                rep.err(where, f"dataSources[{cid}] 的 auth.fields 必须是数组")
            else:
                for f in fields:
                    if not isinstance(f, dict) or not str(f.get("id", "")).strip():
                        rep.err(where, f"dataSources[{cid}] 的 auth.fields 每项都要有 id")


def validate_repo(root, rep):
    manifests = sorted((root / "plugins").glob("*/*/manifest.json"))
    if not manifests:
        rep.err("plugins/", "没有找到任何 <id>/<version>/manifest.json")
        return

    seen = set()
    for mp in manifests:
        where = str(mp.relative_to(root)).replace("\\", "/")
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
        key = (m.get("id"), m.get("version"))
        if key in seen:
            rep.err(where, f"重复的 id@version: {key[0]}@{key[1]}")
        seen.add(key)

    # registry.json 必须和目录对得上，且是 build.py 的**当前**产物。
    reg_path = root / "registry.json"
    if not reg_path.is_file():
        rep.err("registry.json", "缺失；先跑 python tools/build.py")
        return
    try:
        reg = json.loads(reg_path.read_text(encoding="utf-8-sig"))
    except Exception as e:  # noqa: BLE001
        rep.err("registry.json", f"非法 JSON ({e})")
        return

    reg_ids = {p.get("id") for p in reg.get("plugins", []) if isinstance(p, dict)}
    dir_ids = {mp.parent.parent.name for mp in manifests}
    for missing in sorted(dir_ids - reg_ids):
        rep.err("registry.json", f"缺少插件条目: {missing}（忘了跑 build.py？）")
    for extra in sorted(reg_ids - dir_ids):
        rep.err("registry.json", f"列出的插件没有对应目录: {extra}")

    # registry 里每个版本都要有包、有 sha256，且 sha256 对得上。
    # 「registry 写了、包没提交」是最典型的发布事故：市场里看得见，点安装 404。
    from pack_plugin import sha256_of  # noqa: PLC0415

    for p in reg.get("plugins", []):
        if not isinstance(p, dict):
            continue
        if not isinstance(p.get("author"), str):
            rep.err("registry.json", f"{p.get('id')}: author 必须是字符串")
        for v in p.get("versions", []):
            pid, ver = p.get("id"), v.get("version")
            ipk = root / "packages" / f"{pid}-{ver}.ipk"
            if not ipk.is_file():
                rep.err("registry.json", f"{pid}@{ver}: 包文件不存在 packages/{ipk.name}")
                continue
            want = v.get("sha256")
            if not want:
                rep.err("registry.json", f"{pid}@{ver}: 缺少 sha256")
            elif want != sha256_of(ipk):
                rep.err("registry.json", f"{pid}@{ver}: sha256 与包不符（包变了但没重跑 build.py？）")
            if "package_url" not in v:
                rep.err("registry.json", f"{pid}@{ver}: 缺少 package_url（注意是 snake_case）")


# ──────────────────────────── 自检 ────────────────────────────
# 校验器最危险的失败模式是「什么都不报」。这里对着一份好 manifest 逐项注入
# 真实的坏值，任何一条注入没让它变红，就说明那条规则形同虚设。

_GOOD = {
    "id": "com.example.demo", "version": "1.0.0", "apiVersion": 2,
    "name": "示例", "description": "描述", "author": "某人",
    "category": "tools", "targets": ["pc"],
    "permissions": ["ui", "extensions", "http", "sources"],
    "httpAllowedHosts": ["api.example.com", "$sourceServer"],
    "contributes": {
        "panels": [{"id": "p", "title": "T", "slot": "settings", "handler": "h"}],
        "dataSources": [{"id": "s", "name": "源", "auth": {"fields": [{"id": "base_url"}]}}],
    },
}

_INJECTIONS = [
    ("author 写成 v1 的对象", lambda m: m.update(author={"name": "某人"})),
    ("apiVersion 还是 1", lambda m: m.update(apiVersion=1)),
    ("apiVersion 缺失", lambda m: m.pop("apiVersion")),
    ("残留 v1 的 extends", lambda m: m.update(extends={"sidebarItems": []})),
    ("残留 v1 的 runtime", lambda m: m.update(runtime="js")),
    ("用了已删除的 emby.credentials", lambda m: m["permissions"].append("emby.credentials")),
    ("用了已删除的 cfproxy", lambda m: m["permissions"].append("cfproxy")),
    ("编造权限", lambda m: m["permissions"].append("filesystem")),
    ("分类不在枚举里", lambda m: m.update(category="misc")),
    ("targets 含已废弃的 ios", lambda m: m.update(targets=["ios"])),
    ("panel 的 slot 拼错", lambda m: m["contributes"]["panels"][0].update(slot="home-stats")),
    ("panel 没有 slot", lambda m: m["contributes"]["panels"][0].pop("slot")),
    ("贡献 panels 却没声明 extensions", lambda m: m["permissions"].remove("extensions")),
    ("贡献 dataSources 却没声明 sources", lambda m: m["permissions"].remove("sources")),
    ("dataSources 的 auth.fields 缺 id", lambda m: m["contributes"]["dataSources"][0]["auth"].update(fields=[{"label": "地址"}])),
    ("贡献点缺 id", lambda m: m["contributes"]["panels"][0].pop("id")),
    ("未知贡献点类型", lambda m: m["contributes"].update(sidebarItems=[{"id": "x"}])),
    ("白名单用裸 *", lambda m: m["httpAllowedHosts"].append("*")),
    ("白名单令牌拼错", lambda m: m["httpAllowedHosts"].append("$sourceserver")),
    ("声明 http 却白名单为空", lambda m: m.update(httpAllowedHosts=[])),
    ("id 不是反向域名", lambda m: m.update(id="demo")),
    ("版本号不是 x.y.z", lambda m: m.update(version="1.0")),
    ("sandboxViews 路径穿越", lambda m: m["contributes"].update(
        sandboxViews=[{"id": "v", "entry": "../../../etc/passwd"}]) or m["permissions"].append("sandbox")),
]


def _check_schema_drift():
    """schemas/manifest.schema.json 是同一套规则的第二副本（给编辑器补全用）。

    没人会去跑它，所以它是最容易悄悄过期的文件 —— 而过期的后果是作者的编辑器
    对着一个已经不存在的权限给出绿色对勾。这里逐项对回 Python 常量。
    """
    path = Path(__file__).resolve().parents[1] / "schemas" / "manifest.schema.json"
    if not path.is_file():
        return [f"{path.name} 不存在"]
    s = json.loads(path.read_text(encoding="utf-8-sig"))
    props = s["properties"]
    defs = s["$defs"]
    bad = []

    def cmp(name, got, want):
        if set(got) != set(want):
            bad.append(f"{name}: schema={sorted(got)} 常量={sorted(want)}")

    cmp("permissions", props["permissions"]["items"]["enum"], KNOWN_PERMS)
    cmp("category", props["category"]["enum"], CATEGORIES)
    cmp("targets", props["targets"]["items"]["enum"], TARGETS)
    cmp("contributes", props["contributes"]["properties"], CONTRIB_PERM)
    cmp("panel.slot", defs["panel"]["properties"]["slot"]["enum"], PANEL_SLOTS)
    cmp("action.context", defs["action"]["properties"]["context"]["enum"], ACTION_CONTEXTS)
    if props["apiVersion"].get("const") != API_VERSION:
        bad.append(f"apiVersion: schema={props['apiVersion'].get('const')} 常量={API_VERSION}")
    banned = {list(x["required"])[0] for x in s["not"]["anyOf"]}
    cmp("v1 废弃字段", banned, V1_DEAD_FIELDS)
    # 已删除的权限绝不能还留在 schema 的枚举里
    for p in REMOVED_PERMS:
        if p in props["permissions"]["items"]["enum"]:
            bad.append(f"已删除的权限 {p} 还在 schema 枚举里")

    bad += _check_site_permission_table()
    return bad


def _check_site_permission_table():
    """market 页的权限词表（assets/permissions.js）是同一份规则的**第三副本**。

    它决定用户在网站上看到哪些权限、怎么描述。漏一条 = 卡片上少显示一项权限；
    多一条 = 显示一个 App 里根本不存在的权限，比不显示更糟。
    这里只对 id 集合（文案允许小幅出入，那是文风不是契约）。
    """
    path = Path(__file__).resolve().parents[1] / "assets" / "permissions.js"
    if not path.is_file():
        return ["assets/permissions.js 不存在"]
    text = path.read_text(encoding="utf-8")
    # 只在 PERMISSIONS 那个字面量块里找 id，别把 REMOVED_PERMISSIONS 的也算进来。
    body = text.split("export const PERMISSIONS")[1].split("export const REMOVED_PERMISSIONS")[0]
    ids = set(re.findall(r'"([a-z.]+)":\s*\{\s*title', body))
    if ids != KNOWN_PERMS:
        return [
            "assets/permissions.js 与权限表不一致："
            f"多了 {sorted(ids - KNOWN_PERMS)}，少了 {sorted(KNOWN_PERMS - ids)}"
        ]
    removed_body = text.split("export const REMOVED_PERMISSIONS")[1]
    r_ids = set(re.findall(r'"([a-z.]+)":', removed_body))
    if not set(REMOVED_PERMS) <= r_ids:
        return [f"assets/permissions.js 漏了已删除权限的说明：{sorted(set(REMOVED_PERMS) - r_ids)}"]
    return []


def selftest():
    import copy

    drift = _check_schema_drift()
    if drift:
        print("[FAIL] schemas/manifest.schema.json 与校验器常量不一致：", file=sys.stderr)
        for d in drift:
            print(f"  - {d}", file=sys.stderr)
        return 1
    print("  ok  schema 与校验器常量一致")

    rep = Report()
    validate_manifest(copy.deepcopy(_GOOD), rep, "<good>")
    if rep.errors:
        print("[FAIL] 干净的 manifest 不该报错：", file=sys.stderr)
        rep.dump()
        return 1

    bad = 0
    for name, inject in _INJECTIONS:
        m = copy.deepcopy(_GOOD)
        inject(m)
        r = Report()
        validate_manifest(m, r, "<inject>")
        if not r.errors:
            print(f"[FAIL] 注入「{name}」之后校验器居然是绿的 —— 这条规则形同虚设", file=sys.stderr)
            bad += 1
        else:
            print(f"  ok  注入「{name}」→ {r.errors[0].split(': ', 1)[-1]}")
    if bad:
        print(f"\n{bad} 条注入没被抓住。", file=sys.stderr)
        return 1
    print(f"\n自检通过：1 份干净 manifest 无报错 + {len(_INJECTIONS)} 条注入全部变红。")
    return 0


def main():
    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root / "tools"))
    if "--selftest" in sys.argv:
        return selftest()

    rep = Report()
    validate_repo(root, rep)
    n = rep.dump()
    if n:
        print(f"\n{n} 个错误", file=sys.stderr)
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
