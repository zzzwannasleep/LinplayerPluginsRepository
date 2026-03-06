const DEMO_ROUTE = "/plugin/example.pc.demo/home";

function page_home_render(ctx, params = {}, state = {}) {
  const target = ctx?.target ?? "unknown";
  const clicks = Number(state.clicks ?? 0);

  return {
    title: "示例",
    state: { ...state, clicks },
    schema: {
      type: "page",
      props: { gap: 12 },
      children: [
        { type: "text", props: { text: "PC Demo Plugin", bold: true, size: 18 } },
        { type: "text", props: { text: `Target: ${target}` } },
        {
          type: "card",
          children: [
            {
              type: "column",
              props: { gap: 8 },
              children: [
                { type: "text", props: { text: "交互 / Actions", bold: true } },
                { type: "text", props: { text: `clicks: ${clicks}` } },
                {
                  type: "row",
                  props: { gap: 8 },
                  children: [
                    { type: "button", props: { text: `+1 (${clicks})`, event: { name: "click" } } },
                    {
                      type: "button",
                      props: { text: "Toast", event: { name: "toast", payload: { message: "Hello from PC demo" } } }
                    },
                    { type: "button", props: { text: "打开示例页", event: { name: "open_page" } } }
                  ]
                }
              ]
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
                { type: "text", props: { text: "布局 / Components（当前已实现）", bold: true } },
                { type: "divider" },
                {
                  type: "text",
                  props: { text: "支持：page/column/row/list/card/text/markdown/image/button 等", size: 12 }
                },
                {
                  type: "row",
                  props: { gap: 8 },
                  children: [
                    { type: "button", props: { text: "按钮 A", event: { name: "toast", payload: { message: "A" } } } },
                    { type: "button", props: { text: "按钮 B", event: { name: "toast", payload: { message: "B" } } } },
                    { type: "button", props: { text: "按钮 C", event: { name: "toast", payload: { message: "C" } } } }
                  ]
                },
                { type: "spacer", props: { size: 6 } },
                {
                  type: "list",
                  props: { gap: 4 },
                  children: [
                    { type: "text", props: { text: "• 插件中心 → 打开页面：示例", selectable: true } },
                    { type: "text", props: { text: "• 顶部入口 → 主页/喜欢 旁的「示例」（pages.entry=true）", selectable: true } },
                    { type: "text", props: { text: "• 首页 Slot：home.feed.beforeSections", selectable: true } },
                    {
                      type: "text",
                      props: { text: "• 详情/播放 Slot：detail.sections.bottom / player.appbar.trailing", selectable: true }
                    }
                  ]
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
                    { type: "text", props: { text: "params（宿主传入）", bold: true } },
                    { type: "markdown", props: { text: JSON.stringify(params, null, 2), selectable: true } }
                  ]
                }
              ]
            }
          : null
      ].filter(Boolean)
    }
  };
}

function page_home_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";

  if (name === "click") {
    const clicks = Number(state.clicks ?? 0) + 1;
    return { state: { ...state, clicks } };
  }

  if (name === "toast") {
    const message = event?.payload?.message;
    return { state, actions: [{ type: "toast", message: message ? String(message) : "Hello from PC demo" }] };
  }

  if (name === "open_page") {
    return { state, actions: [{ type: "navigate", route: DEMO_ROUTE, params: {} }] };
  }

  return { state };
}

function slot_home_render(ctx, params = {}, state = {}) {
  const page = params?.page ?? "";
  return {
    state,
    schema: {
      type: "card",
      children: [
        {
          type: "column",
          props: { gap: 8 },
          children: [
            { type: "text", props: { text: "PC Slot: home.feed.beforeSections", bold: true } },
            page ? { type: "text", props: { text: `page: ${page}` } } : null,
            {
              type: "row",
              props: { gap: 8 },
              children: [
                { type: "button", props: { text: "打开示例页", event: { name: "open_page" } } },
                { type: "button", props: { text: "Toast", event: { name: "toast" } } }
              ]
            }
          ].filter(Boolean)
        }
      ]
    }
  };
}

function slot_home_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";
  if (name === "toast") {
    return { state, actions: [{ type: "toast", message: "Hello from PC home slot" }] };
  }
  if (name === "open_page") {
    return { state, actions: [{ type: "navigate", route: DEMO_ROUTE, params: {} }] };
  }
  return { state };
}

function slot_detail_bottom_render(ctx, params = {}, state = {}) {
  const media = params?.media ?? {};
  const title = media?.title ?? "";
  return {
    state,
    schema: {
      type: "column",
      props: { gap: 8 },
      children: [
        { type: "text", props: { text: "PC Slot: detail.sections.bottom", bold: true } },
        title ? { type: "text", props: { text: `Media: ${title}` } } : null,
        { type: "button", props: { text: "Open 示例页", event: { name: "open_page" } } }
      ].filter(Boolean)
    }
  };
}

function slot_detail_bottom_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";
  if (name === "open_page") {
    return { state, actions: [{ type: "navigate", route: DEMO_ROUTE, params: {} }] };
  }
  return { state };
}

function slot_player_appbar_render(ctx, params = {}, state = {}) {
  return {
    state,
    schema: {
      type: "button",
      props: { text: "示例", event: { name: "open_page" } }
    }
  };
}

function slot_player_appbar_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";
  if (name === "open_page") {
    return { state, actions: [{ type: "navigate", route: DEMO_ROUTE, params: {} }] };
  }
  return { state };
}
