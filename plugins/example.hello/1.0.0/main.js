const BILIBILI_URL = "https://www.bilibili.com/";
const HTTPBIN_URL = "https://httpbin.org/get?plugin=example.hello";

function buildStatePreview(state = {}) {
  const demoState = state.demoState ?? "empty";
  const lastFetchAt = state.lastFetchAt ?? "";
  const lastError = state.lastError ?? "";
  const lastFetchSummary = state.lastFetchSummary ?? null;

  if (demoState === "loading") {
    return { type: "loading" };
  }

  if (demoState === "error") {
    return {
      type: "error",
      props: {
        message: lastError || "这是示例插件主动展示的 error 节点。"
      }
    };
  }

  if (demoState === "ready") {
    return {
      type: "card",
      children: [
        {
          type: "column",
          props: { gap: 8 },
          children: [
            { type: "text", props: { text: "最近一次请求成功。", bold: true } },
            {
              type: "text",
              props: { text: `HTTP status: ${lastFetchSummary?.status ?? "unknown"}` }
            },
            lastFetchSummary?.origin
              ? { type: "text", props: { text: `Origin: ${lastFetchSummary.origin}` } }
              : null,
            lastFetchSummary?.url
              ? { type: "text", props: { text: `URL: ${lastFetchSummary.url}` } }
              : null,
            lastFetchAt
              ? { type: "text", props: { text: `Fetched at: ${lastFetchAt}` } }
              : null
          ].filter(Boolean)
        }
      ]
    };
  }

  return {
    type: "empty",
    props: {
      message: "还没有请求结果。你可以先点“请求 httpbin”，或者直接打开 / 嵌入 Bilibili。"
    }
  };
}

function buildFetchSummary(res) {
  const data = res?.data && typeof res.data === "object" ? res.data : {};

  return {
    status: res?.status ?? "unknown",
    origin: data.origin ? String(data.origin) : "",
    url: data.url ? String(data.url) : ""
  };
}

function page_home_render(ctx, params = {}, state = {}) {
  const target = ctx?.target ?? "unknown";
  const showWebview = Boolean(state.showWebview);

  return {
    title: "Website + Network Example",
    state: {
      ...state,
      demoState: state.demoState ?? "empty",
      showWebview
    },
    schema: {
      type: "page",
      props: { gap: 16 },
      children: [
        {
          type: "section",
          props: {
            title: "这个示例演示什么",
            subtitle: "按新版 SPEC 重写的 example.hello",
            gap: 12
          },
          children: [
            {
              type: "card",
              children: [
                {
                  type: "column",
                  props: { gap: 8 },
                  children: [
                    { type: "text", props: { text: "1. 用 openUrl 让宿主直接打开外部网站。" } },
                    { type: "text", props: { text: "2. 用受控 webview 把网页当作页面里的辅助块。" } },
                    {
                      type: "text",
                      props: { text: "3. 用 ctx.net.request() 做最小网络请求，并把结果映射回结构化 UI。" }
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "section",
          props: {
            title: "操作区",
            subtitle: `Target: ${target}`,
            gap: 12
          },
          children: [
            {
              type: "card",
              children: [
                {
                  type: "column",
                  props: { gap: 8 },
                  children: [
                    {
                      type: "button",
                      props: { text: "打开 Bilibili", event: { name: "open_bilibili" } }
                    },
                    {
                      type: "button",
                      props: {
                        text: showWebview ? "隐藏 WebView" : "显示 WebView",
                        event: { name: "toggle_webview" }
                      }
                    },
                    {
                      type: "row",
                      props: { gap: 8 },
                      children: [
                        { type: "button", props: { text: "请求 httpbin", event: { name: "fetch_httpbin" } } },
                        { type: "button", props: { text: "重置", event: { name: "reset" } } }
                      ]
                    },
                    {
                      type: "row",
                      props: { gap: 8 },
                      children: [
                        { type: "button", props: { text: "显示 loading", event: { name: "show_loading" } } },
                        { type: "button", props: { text: "显示 empty", event: { name: "show_empty" } } },
                        { type: "button", props: { text: "显示 error", event: { name: "show_error" } } }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "section",
          props: {
            title: "状态节点预览",
            subtitle: "loading / empty / error / ready",
            gap: 12
          },
          children: [buildStatePreview(state)]
        },
        {
          type: "section",
          props: {
            title: "辅助 WebView",
            subtitle: "只作为页面里的辅助块，不替代整页 UI",
            gap: 12
          },
          children: [
            {
              type: "text",
              props: {
                text: "根据新版 SPEC，webview 适合承载必须保留原网页交互的局部内容。完整网站入口则交给 openUrl。"
              }
            },
            showWebview
              ? {
                  type: "card",
                  children: [
                    {
                      type: "webview",
                      props: {
                        src: BILIBILI_URL,
                        height: target === "pc" ? 560 : 420,
                        title: "Bilibili",
                        allowExternalNavigation: false,
                        showProgress: true
                      }
                    }
                  ]
                }
              : {
                  type: "empty",
                  props: {
                    message: "当前未显示 webview。点击上面的“显示 WebView”按钮。"
                  }
                }
          ]
        },
        params && Object.keys(params).length
          ? {
              type: "section",
              props: {
                title: "宿主传入的 params",
                gap: 12
              },
              children: [
                {
                  type: "card",
                  children: [
                    {
                      type: "markdown",
                      props: {
                        text: "```json\n" + JSON.stringify(params, null, 2) + "\n```",
                        selectable: true
                      }
                    }
                  ]
                }
              ]
            }
          : null
      ].filter(Boolean)
    }
  };
}

async function page_home_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";

  if (name === "open_bilibili") {
    return {
      state,
      actions: [{ type: "openUrl", url: BILIBILI_URL }]
    };
  }

  if (name === "toggle_webview") {
    const showWebview = !Boolean(state.showWebview);

    return {
      state: {
        ...state,
        showWebview
      },
      actions: [
        {
          type: "toast",
          message: showWebview ? "WebView 已显示" : "WebView 已隐藏"
        }
      ]
    };
  }

  if (name === "fetch_httpbin") {
    try {
      const res = await ctx.net.request({
        url: HTTPBIN_URL,
        method: "GET",
        headers: {
          "User-Agent": "example.hello/1.0.0",
          Accept: "application/json"
        },
        timeoutMs: 15000,
        responseType: "json"
      });

      return {
        state: {
          ...state,
          demoState: "ready",
          lastFetchAt: new Date().toISOString(),
          lastFetchSummary: buildFetchSummary(res),
          lastError: ""
        },
        actions: [{ type: "toast", message: `请求完成：${res.status}` }]
      };
    } catch (e) {
      return {
        state: {
          ...state,
          demoState: "error",
          lastError: String(e)
        },
        actions: [{ type: "toast", message: `请求失败：${String(e)}` }]
      };
    }
  }

  if (name === "show_loading") {
    return {
      state: {
        ...state,
        demoState: "loading"
      },
      actions: [{ type: "toast", message: "已切换到 loading 示例" }]
    };
  }

  if (name === "show_empty") {
    return {
      state: {
        ...state,
        demoState: "empty"
      },
      actions: [{ type: "toast", message: "已切换到 empty 示例" }]
    };
  }

  if (name === "show_error") {
    return {
      state: {
        ...state,
        demoState: "error",
        lastError: state.lastError || "这是示例插件主动展示的 error 节点。"
      },
      actions: [{ type: "toast", message: "已切换到 error 示例" }]
    };
  }

  if (name === "reset") {
    return {
      state: {
        demoState: "empty",
        showWebview: false,
        lastFetchAt: "",
        lastFetchSummary: null,
        lastError: ""
      },
      actions: [{ type: "toast", message: "示例状态已重置" }]
    };
  }

  return { state };
}
