# UHDNow 求片

一站式在 App 内提交 UHDNow 求片 / 追新，并查看自己的求片状态。对应官网
[/user/help/media-requests](https://www.uhdnow.com/user/help/media-requests)。

## 使用

1. 安装启用后，到「设置 → 插件 → UHDNow 求片 → 账号设置」填写 uhdnow **网站**账号密码
   （若与添加 Emby 服务器时填的账密相同，可不填，会自动回退使用）。
2. 打开「求片 / 我的求片」：
   - **搜索求片**：输入影视名称 → 选中条目 → 填补充说明 → 提交。
     开启「追新」开关表示对片库已有内容求更新（`refresh`），关闭为求新片（`missing`）。
   - **我的求片**：查看已提交的求片及处理状态（待处理 / 处理中 / 已暂缓 / 未通过 / 已完成）。

## 原理

登录拿 token 后：

- `POST /api/v1/media-requests/search`  按关键字搜 TMDB 条目；
- `POST /api/v1/media-requests`         提交求片（带 tmdb_id、类型、说明等）；
- `POST /api/v1/media-requests/mine/list` 拉取我的求片列表。

`Authorization` 头用原始 token（非 Bearer），与官网前端一致。

## 权限

`emby.read`、`emby.credentials`、`http`（限 `www.uhdnow.com`）、`storage`、`ui`、`extensions`。
