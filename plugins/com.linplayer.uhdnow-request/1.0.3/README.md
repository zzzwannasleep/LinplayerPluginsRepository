# UHDNow 求片

搜索后弹出**带海报的结果列表**点选影视，填说明提交求片 / 追新；查看我的求片与全部求片（带海报），
为热门求片投票。对应官网 [/user/help/media-requests](https://www.uhdnow.com/user/help/media-requests)。

## 使用

1. 「设置 → 插件 → UHDNow 求片 → 账号设置」填 uhdnow **网站**账号密码（同 Emby 可不填）。
2. 打开「求片 / 我的求片」：
   - **搜索求片**：输入名称 + 选类型 → 弹出**带海报的结果列表**点选 → **填说明（必填）** → 提交。
   - **我的求片**：带海报的列表，点选看详情（类型 / 状态 / 说明）。
   - **全部求片**：带海报的列表，点选可投票 / 取消投票（✓已投）。

## 关键修复

- **说明必填**：官网求片要求填「处理说明」，留空服务端返回“参数验证失败”。本插件提交前强制校验。
- **不再被 30s 超时打断**：宿主改为「空转看门狗」，等你搜索 / 选片 / 填说明期间不计时。

## 原理

`POST /media-requests/search` 搜 TMDB → `POST /media-requests` 提交（含 tmdb_id / 类型 / 必填说明）
→ `POST /media-requests/mine/list` 我的 / `POST /media-requests/list` 全部
→ `POST|DELETE /media-requests/{id}/vote` 投票。海报由宿主直接加载 image.tmdb.org。失败全落日志。

## 注意

- **需较新宿主 build**：依赖 `ctx.ui.showList`（带海报列表）、`select` 表单、`ctx.http.delete`、空转看门狗。

## 权限

`emby.read`、`emby.credentials`、`http`（限 `www.uhdnow.com`）、`storage`、`ui`、`extensions`。
