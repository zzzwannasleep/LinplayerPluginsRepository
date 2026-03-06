function page_home_render(ctx, params = {}, state = {}) {
  const target = ctx?.target ?? "unknown";
  const clicks = Number(state.clicks ?? 0);

  return {
    title: "示例",
    state: { ...state, clicks },
    schema: {
      type: "page",
      props: { title: "示例" },
      children: [
        { type: "text", props: { text: `Target: ${target}` } },
        { type: "text", props: { text: "PC 示例页：组件展示 + 插件入口" } },
        {
          type: "row",
          children: [
            {
              type: "column",
              children: [
                {
                  type: "card",
                  children: [
                    { type: "text", props: { text: "Quick Actions" } },
                    { type: "button", props: { text: `Click +1 (${clicks})`, event: { name: "click" } } },
                    { type: "button", props: { text: "Toast", event: { name: "toast" } } },
                    { type: "button", props: { text: "Re-open This Page", event: { name: "open_page" } } }
                  ]
                },
                {
                  type: "card",
                  children: [
                    { type: "text", props: { text: "Chips / Badges" } },
                    {
                      type: "row",
                      children: [
                        {
                          type: "chip",
                          props: {
                            text: "Chip: Toast",
                            event: { name: "toast", payload: { message: "Chip clicked" } }
                          }
                        },
                        { type: "badge", props: { text: "Badge: PC" } }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              type: "column",
              children: [
                {
                  type: "card",
                  children: [
                    { type: "text", props: { text: "IconButtons（inline）" } },
                    {
                      type: "row",
                      children: [
                        {
                          type: "iconButton",
                          props: {
                            icon: "info",
                            tooltip: "Toast",
                            event: { name: "toast", payload: { message: "IconButton clicked" } }
                          }
                        },
                        {
                          type: "iconButton",
                          props: { icon: "open_in_new", tooltip: "Open 示例页", event: { name: "open_page" } }
                        }
                      ]
                    }
                  ]
                },
                {
                  type: "card",
                  children: [
                    { type: "text", props: { text: "PC 端适配点（建议）" } },
                    {
                      type: "markdown",
                      props: {
                        text: "- 顶栏入口（`首页` / `喜欢` 旁）\\n- 鼠标/键盘操作\\n- Resize/滚动表现\\n- 更高信息密度布局（row/column）"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
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
    return { state, actions: [{ type: "navigate", route: "/plugin/example.pc.demo/home", params: {} }] };
  }

  return { state };
}

function slot_home_render(ctx, params = {}, state = {}) {
  const placement = params?.placement ?? "";
  return {
    state,
    schema: {
      type: "card",
      children: [
        { type: "text", props: { text: "PC Slot: home.feed.beforeSections" } },
        placement ? { type: "text", props: { text: `placement: ${placement}` } } : null,
        {
          type: "row",
          children: [
            { type: "button", props: { text: "打开示例页", event: { name: "open_page" } } },
            { type: "button", props: { text: "Toast", event: { name: "toast" } } }
          ]
        }
      ].filter(Boolean)
    }
  };
}

function slot_home_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";
  if (name === "toast") {
    return { state, actions: [{ type: "toast", message: "Hello from PC home slot" }] };
  }
  if (name === "open_page") {
    return { state, actions: [{ type: "navigate", route: "/plugin/example.pc.demo/home", params: {} }] };
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
      children: [
        { type: "text", props: { text: "PC Slot: detail.sections.bottom" } },
        title ? { type: "text", props: { text: `Media: ${title}` } } : null,
        { type: "button", props: { text: "Open 示例页", event: { name: "open_page" } } }
      ].filter(Boolean)
    }
  };
}

function slot_detail_bottom_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";
  if (name === "open_page") {
    return { state, actions: [{ type: "navigate", route: "/plugin/example.pc.demo/home", params: {} }] };
  }
  return { state };
}

function slot_player_appbar_render(ctx, params = {}, state = {}) {
  return {
    state,
    schema: {
      type: "row",
      children: [
        { type: "iconButton", props: { icon: "info", tooltip: "示例", event: { name: "toast" } } },
        { type: "iconButton", props: { icon: "open_in_new", tooltip: "Open 示例页", event: { name: "open_page" } } }
      ]
    }
  };
}

function slot_player_appbar_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";
  if (name === "toast") {
    return { state, actions: [{ type: "toast", message: "PC player action" }] };
  }
  if (name === "open_page") {
    return { state, actions: [{ type: "navigate", route: "/plugin/example.pc.demo/home", params: {} }] };
  }
  return { state };
}
