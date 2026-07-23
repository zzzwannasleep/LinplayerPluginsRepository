# Hello 示例

最小的 LinPlayer 插件，一共两个文件、六十行代码。

启用后：

- **首页**多出一句 `Hello, World`
- **插件 → Hello 示例 → 设置**里可以把 `World` 改成别的

## 它演示了什么

| 能力 | 在哪 |
|---|---|
| 在 manifest 里静态声明面板 | `contributes.panels` |
| 面板返回**界面描述树** | `renderGreeting()` / `renderSettings()` |
| 按钮回调拿到表单值 | `saveSettings(values)` |
| 每个插件独立的本地存储 | `ctx.storage.get/set` |
| 弹一句提示 | `ctx.ui.showToast` |

## 两个新手一定会踩的坑

**输入控件的键是 `id`，初始值的键是 `value`。** 写成 `key` / `default` 的话，
这个控件会被宿主静默丢弃 —— 表单一片空白，日志里什么都没有。

**面板必须返回一棵带 `t` 的描述树。** 返回 `{ metrics: [...] }` 这类形状
（旧版插件的写法）同样是静默丢弃，面板画出来是空的。

## 拿它当模板

```bash
cp -r plugins/com.linplayer.hello/2.0.0 plugins/com.example.mine/1.0.0
# 改 manifest.json 里的 id / name / description，然后
python tools/pack_plugin.py plugins/com.example.mine/1.0.0
# 得到 packages/com.example.mine-1.0.0.ipk，在 App 里「安装本地插件」
```
