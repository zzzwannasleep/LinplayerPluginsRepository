# UHDNow 求片

在 App 内提交 UHDNow 求片 / 追新，查看我的求片与全部求片，为热门求片投票。
对应官网 [/user/help/media-requests](https://www.uhdnow.com/user/help/media-requests)。

## 使用

1. 「设置 → 插件 → UHDNow 求片 → 账号设置」填 uhdnow **网站**账号密码（同 Emby 可不填）。
2. 打开「求片 / 我的求片」：
   - **搜索求片**：输入名称 + 选类型（求片 / 追新）→ 下拉选中条目 → **填说明（必填）** → 提交。
   - **我的求片**：查看已提交求片及状态（待处理 / 处理中 / 已暂缓 / 未通过 / 已完成）。
   - **全部求片**：浏览列表，选一条投票 / 取消投票（✓ = 你已投过）。

## 说明为什么必填

官网求片同样要求填「处理说明」，留空服务端会返回 **参数验证失败**。本插件因此在提交前强制校验，
留空会提示重填。

## 原理

`POST /media-requests/search` 搜 TMDB → `POST /media-requests` 提交（含 tmdb_id / 类型 / 必填说明）
→ `POST /media-requests/mine/list` 我的 / `POST /media-requests/list` 全部
→ `POST|DELETE /media-requests/{id}/vote` 投票。所有失败都写插件日志（含服务端 msg）。

## 注意

- **需较新宿主 build**：依赖本次新增的下拉表单字段与 `ctx.http.delete`（取消投票）。

## 权限

`emby.read`、`emby.credentials`、`http`（限 `www.uhdnow.com`）、`storage`、`ui`、`extensions`。
