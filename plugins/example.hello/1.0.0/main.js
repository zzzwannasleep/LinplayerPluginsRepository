const NETWORK_ROUTE = "/plugin/example.hello/home";

function page_home_render(ctx, params = {}, state = {}) {
  const target = ctx?.target ?? "unknown";
  const lastStatus = state.lastStatus ?? "idle";
  const lastFetchedAt = state.lastFetchedAt ?? "";
  const lastError = state.lastError ?? "";

  return {
    title: "Network Example",
    state,
    schema: {
      type: "page",
      props: { gap: 12 },
      children: [
        { type: "text", props: { text: "Network Example Plugin", bold: true, size: 18 } },
        { type: "text", props: { text: "这个示例只演示如何在 onEvent 里发起网络请求。" } },
        {
          type: "card",
          children: [
            {
              type: "column",
              props: { gap: 8 },
              children: [
                { type: "text", props: { text: `Target: ${target}` } },
                { type: "text", props: { text: `Last status: ${lastStatus}` } },
                lastFetchedAt ? { type: "text", props: { text: `Last fetched at: ${lastFetchedAt}` } } : null,
                lastError ? { type: "text", props: { text: `Last error: ${lastError}` } } : null,
                {
                  type: "row",
                  props: { gap: 8 },
                  children: [
                    { type: "button", props: { text: "Fetch httpbin.org", event: { name: "fetch" } } },
                    { type: "button", props: { text: "Open httpbin.org", event: { name: "open_url" } } },
                    { type: "button", props: { text: "Reset", event: { name: "reset" } } }
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
                { type: "text", props: { text: "你可以重点看这几点", bold: true } },
                { type: "text", props: { text: "1. manifest.json 里声明 permissions.network.domains" } },
                { type: "text", props: { text: "2. onEvent() 里调用 ctx.net.request()" } },
                { type: "text", props: { text: "3. 请求成功和失败都返回清晰状态" } }
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

  if (name === "fetch") {
    try {
      const res = await ctx.net.request({
        url: "https://httpbin.org/get?plugin=example.hello",
        method: "GET",
        headers: {
          "User-Agent": "example.hello/1.0.0",
          "Accept": "application/json"
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
        actions: [{ type: "toast", message: `Fetch done: ${res.status}` }]
      };
    } catch (e) {
      return {
        state: {
          ...state,
          lastStatus: "error",
          lastError: String(e)
        },
        actions: [{ type: "toast", message: `Fetch failed: ${String(e)}` }]
      };
    }
  }

  if (name === "open_url") {
    return {
      state,
      actions: [{ type: "openUrl", url: "https://httpbin.org/get" }]
    };
  }

  if (name === "reset") {
    return {
      state: {},
      actions: [{ type: "toast", message: "State cleared" }]
    };
  }

  if (name === "open_page") {
    return {
      state,
      actions: [{ type: "navigate", route: NETWORK_ROUTE, params: {} }]
    };
  }

  return { state };
}
