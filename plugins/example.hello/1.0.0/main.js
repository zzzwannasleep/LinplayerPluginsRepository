function page_home_render(ctx, params = {}, state = {}) {
  const target = ctx?.target ?? "unknown";
  const lastStatus = state.lastStatus ?? "idle";
  const lastFetchedAt = state.lastFetchedAt ?? "";
  const lastError = state.lastError ?? "";

  return {
    title: "Open Website Example",
    state,
    schema: {
      type: "page",
      props: { gap: 12 },
      children: [
        { type: "text", props: { text: "Open Website Example Plugin", bold: true, size: 18 } },
        {
          type: "text",
          props: {
            text: "这个示例把“打开网站”和“发起网络请求”拆开演示。先点“打开 Bilibili”，效果会比单纯请求接口更直观。"
          }
        },
        {
          type: "card",
          children: [
            {
              type: "column",
              props: { gap: 8 },
              children: [
                { type: "text", props: { text: `Target: ${target}` } },
                { type: "text", props: { text: "Website: https://www.bilibili.com/" } },
                { type: "text", props: { text: `Last fetch status: ${lastStatus}` } },
                lastFetchedAt
                  ? { type: "text", props: { text: `Last fetched at: ${lastFetchedAt}` } }
                  : null,
                lastError
                  ? { type: "text", props: { text: `Last error: ${lastError}` } }
                  : null,
                {
                  type: "button",
                  props: { text: "打开 Bilibili", event: { name: "open_bilibili" } }
                },
                {
                  type: "row",
                  props: { gap: 8 },
                  children: [
                    { type: "button", props: { text: "请求 httpbin", event: { name: "fetch" } } },
                    { type: "button", props: { text: "重置状态", event: { name: "reset" } } }
                  ]
                }
              ].filter(Boolean)
            }
          ]
        },
        {
          type: "card",
          children: [
            {
              type: "column",
              props: { gap: 8 },
              children: [
                { type: "text", props: { text: "看这三个点", bold: true } },
                { type: "text", props: { text: "1. 用 openUrl 可以直接让宿主打开外部网站。" } },
                {
                  type: "text",
                  props: { text: "2. 用 ctx.net.request() 时，manifest.json 里仍然要声明 permissions.network.domains。" }
                },
                {
                  type: "text",
                  props: { text: "3. 这个示例把“打开网站”和“请求接口”分成两个按钮，便于插件作者对照理解。" }
                }
              ]
            }
          ]
        },
        params && Object.keys(params).length
          ? {
              type: "card",
              children: [
                {
                  type: "column",
                  props: { gap: 8 },
                  children: [
                    { type: "text", props: { text: "宿主传入的 params", bold: true } },
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
      actions: [{ type: "openUrl", url: "https://www.bilibili.com/" }]
    };
  }

  if (name === "fetch") {
    try {
      const res = await ctx.net.request({
        url: "https://httpbin.org/get?plugin=example.hello",
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
          lastStatus: `success (${res.status})`,
          lastFetchedAt: new Date().toISOString(),
          lastError: ""
        },
        actions: [{ type: "toast", message: `请求完成：${res.status}` }]
      };
    } catch (e) {
      return {
        state: {
          ...state,
          lastStatus: "error",
          lastError: String(e)
        },
        actions: [{ type: "toast", message: `请求失败：${String(e)}` }]
      };
    }
  }

  if (name === "reset") {
    return {
      state: {},
      actions: [{ type: "toast", message: "状态已重置" }]
    };
  }

  return { state };
}
