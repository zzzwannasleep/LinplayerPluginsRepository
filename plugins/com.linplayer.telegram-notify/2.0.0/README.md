# Telegram 播放通知

每看完一集，自动用你的 Telegram Bot 发一条消息。

## 用之前

1. 找 [@BotFather](https://t.me/BotFather) 建一个 Bot，拿到 **Bot Token**
2. 找 [@userinfobot](https://t.me/userinfobot) 拿到你的 **Chat ID**
3. 在「插件 → Telegram 播放通知 → 设置」里填进去，点「发条测试消息」验证

## 出网范围

清单里只写了 `api.telegram.org` 一个域名。插件想访问别的地址会被直接拒掉 ——
白名单是 fail-closed 的，不在名单里就是不行。

## v2 有什么变化

设置从弹窗改成了内嵌面板（能直接看到「已配置 / 未配置」状态），并多了一个开关
可以临时停掉通知而不用清空账号。
