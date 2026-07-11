# UHDNow 求片

一站式在 App 内提交 UHDNow 求片 / 追新，查看自己的求片，浏览热门求片并投票。
对应官网 [/user/help/media-requests](https://www.uhdnow.com/user/help/media-requests)。

## 使用

1. 「设置 → 插件 → UHDNow 求片 → 账号设置」填 uhdnow **网站**账号密码（同 Emby 则可不填）。
2. 打开「求片 / 我的求片」：
   - **搜索求片**：输入名称 → 选条目 → 填说明 → 提交。开「追新」开关=对已有内容求更新（`refresh`），关=求新片（`missing`）。
   - **我的求片**：查看已提交求片及状态（待处理 / 处理中 / 已暂缓 / 未通过 / 已完成）。
   - **热门求片**：浏览大家的求片，选序号给它投票 / 取消投票（✓ 表示你已投过）。

## 原理

`POST /media-requests/search` 搜 TMDB → `POST /media-requests` 提交 → `POST /media-requests/mine/list`
我的 / `POST /media-requests/list` 热门 → `POST|DELETE /media-requests/{id}/vote` 投票。

## 注意

- **投票取消需宿主 build 支持 `ctx.http.delete`**（本次随插件一起提交的宿主改动）。请用配套新 build。
- 所有请求失败都会写插件日志（含服务端返回的 msg），便于定位问题。

## 权限

`emby.read`、`emby.credentials`、`http`（限 `www.uhdnow.com`）、`storage`、`ui`、`extensions`。
