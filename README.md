# LinPlayer 插件仓库

LinPlayer 的官方插件源。市场页：<https://lplugins.902541.xyz>

App 里的插件市场默认订阅的就是这个仓库的 `registry.json`。

- [开发指南](GUIDE.md) —— 五分钟写出第一个插件
- [插件规范](SPEC.md) —— `apiVersion: 2` 的完整参考

## 目录

| 路径 | 是什么 |
|---|---|
| `plugins/<id>/<version>/` | 插件源码。**唯一的元数据来源**。 |
| `packages/*.ipk` | 打包产物。由脚本生成，纳入版本库供市场直接下载。 |
| `registry.json` | 市场索引。由脚本生成，**不要手写**。 |
| `schemas/manifest.schema.json` | 给编辑器补全用的清单 schema。 |
| `tools/` | 校验 / 打包 / 构建。 |
| `index.html` `guide.html` `spec.html` `assets/` | 市场网站。零构建、零依赖（除了一个 36KB 的 Markdown 渲染器）。 |

## 现有插件

| 插件 | 分类 | 干什么 |
|---|---|---|
| `com.linplayer.hello` | 工具 | 最小教学示例。想写插件从抄它开始。 |
| `com.linplayer.ui-kit` | 界面 | 每一种界面块画一遍并贴上对应 JSON。写插件时开着照抄。 |
| `com.linplayer.sandbox-demo` | 界面 | iframe 逃生舱：声明式界面画不出来的东西怎么办。 |
| `com.linplayer.m3u` | 数据源 | 填一个 m3u 地址，按分组浏览频道并播放。 |
| `com.linplayer.telegram-notify` | 通知 | 看完一集给自己的 Telegram 发条消息。 |
| `com.linplayer.uhdnow` | 工具 | UHDNow 的流量 / 求片 / 测速三合一。 |

## 发布流程

```bash
# 1. 插件放进 plugins/<id>/<version>/，目录名必须和 manifest 里的 id、version 一致
# 2. 校验 + 打包 + 更新索引
python tools/build.py
# 3. 提交这三样
git add plugins packages registry.json
```

`build.py` 会先用和 CI 同一套规则校验，不过就中止，不会产出半成品。

仓库地址从 `GITHUB_REPOSITORY` 或 git remote 推导，**没有硬编码**。
换组织或改仓库名之后重跑一次即可，不用手改脚本。

```bash
python tools/validate_repo.py            # 只校验
python tools/validate_repo.py --selftest # 校验器自检（往干净 manifest 里注入坏值，确认它会红）
python tools/build.py --check            # 只检查产物是不是最新的（不写文件）
python tools/pack_plugin.py plugins/<id>/<ver>/   # 单个打包，顺便打印 sha256
```

## 几条不显然的规矩

**打包是确定性的，但不保证跨平台逐字节相同。** 时间戳、文件顺序、权限位、
`create_system` 都钉死了，索引里也没有任何时间戳；但 deflate 压缩流跨 zlib 版本
不保证一致（Windows 和 Linux 实测就不同）。所以 CI **不比字节**，而是逐文件比
`.ipk` 里的内容和 `plugins/` 里的源码 —— 平台无关，而且能直接点名是哪个文件对不上。

**索引里的版本键是 snake_case。** `package_url` 不是 `packageUrl`。写成驼峰会被 App
静默忽略，整条插件从市场里消失而两边都不报错。`author` 同理，必须是字符串。

**图标内联进索引。** 构建时压成 data URI，所以市场页一个额外请求都不发、永远不碎图，
也不受图床可达性影响。代价是索引变大，因此图标有 64KB 上限。

**分发走 GitHub raw，不要挪到 Cloudflare。** 国内有地方会阻断 CF，GitHub 反而更稳。

**只做 sha256，不做代码签名。** 校验和保证拿到的和仓库里的是同一份，不代表内容
被审计过。

## v1 去哪了

`apiVersion: 1` 的插件在当前版本的 App 上装不上，**没有兼容层**。
`runtime` / `extends` / `emby.credentials` / `cfproxy` 这些概念全部移除，
理由写在 [SPEC.md](SPEC.md) 里。旧插件的源码在 git 历史里。

两个 iOS 专用插件也一并删除 —— 苹果全线不做了。
`cf-proxy` 插件删除 —— CF 优选反代已经是 App 的内置功能。

## 授权

代码 MIT（见 [LICENSE](LICENSE)）。各插件访问的第三方服务遵循各自的条款。
