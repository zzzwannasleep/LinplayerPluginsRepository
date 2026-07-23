// 权限词表 —— 给用户看的人话，不是给开发者看的权限名。
//
// ★ 这是宿主 `crates/core/src/plugins/permission.rs::ALL` 的副本。
//   id 集合由 `tools/validate_repo.py --selftest` 对回校验器常量（漏一个/多一个都会红）；
//   文案允许小幅出入，但**别自己发明权限** —— 市场页显示一条 App 里根本不存在的
//   权限，比不显示更糟。
//
// 写法上照 Chrome 扩展的权限警告：说**影响**不说权限名，说清**范围**，
// 动词用「读取 / 修改 / 访问」这类立刻能懂的词。
export const PERMISSIONS = {
  "player.read": { title: "读取播放状态", danger: false,
    desc: "获取当前播放的媒体信息、播放进度，并监听播放事件（如播放结束）。" },
  "player.control": { title: "控制播放器", danger: true,
    desc: "可以播放、暂停、跳转当前视频。" },
  "http": { title: "网络访问", danger: true,
    desc: "通过 HTTPS 访问外部网络（受域名白名单限制）。" },
  "storage": { title: "本地存储", danger: false,
    desc: "在本地保存插件自己的数据（每个插件独立，上限 5MB）。" },
  "ui": { title: "界面交互", danger: false,
    desc: "弹出提示、对话框，或打开插件页面。" },
  "emby.read": { title: "读取 Emby 信息", danger: false,
    desc: "读取当前登录用户和服务器地址。" },
  "emby.api": { title: "调用 Emby 接口", danger: true,
    desc: "以当前登录身份向 Emby 服务器发起任意 API 请求。" },
  "sources": { title: "提供数据源", danger: true,
    desc: "向应用注册可浏览、搜索、播放的媒体源，出现在你的服务器列表里。" },
  "extensions": { title: "扩展界面", danger: false,
    desc: "向应用注册侧边栏入口、操作按钮、设置页等界面模块。" },
  "sandbox": { title: "自定义界面", danger: true,
    desc: "在隔离沙箱里渲染插件自带的网页界面（拿不到应用本身的任何接口）。" },
  "log": { title: "写日志", danger: false,
    desc: "输出调试日志（始终允许）。" },
};

/** v2 已删除的权限。老插件里撞上要给一句人话，而不是「未知权限」。 */
export const REMOVED_PERMISSIONS = {
  "emby.credentials": "宿主不再保存登录密码；插件要账密请自己弹表单收。",
  "cfproxy": "CF 优选反代已改为应用内置功能，不再经由插件。",
};

export const permInfo = (id) =>
  PERMISSIONS[id] || { title: id, danger: true, desc: "未知权限（这个版本的市场页还不认识它）。" };
