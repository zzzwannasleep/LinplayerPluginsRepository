function page_home_render(ctx, params = {}, state = {}) {
  const target = ctx?.target ?? "unknown";
  const clicks = Number(state.clicks ?? 0);

  return {
    title: "PC Demo",
    state: { ...state, clicks },
    schema: {
      type: "page",
      props: { title: "PC Demo" },
      children: [
        { type: "text", props: { text: `Target: ${target}` } },
        {
          type: "row",
          children: [
            {
              type: "column",
              children: [
                { type: "text", props: { text: "Quick Actions" } },
                { type: "button", props: { text: `Click +1 (${clicks})`, event: { name: "click" } } },
                { type: "button", props: { text: "Toast", event: { name: "toast" } } }
              ]
            },
            {
              type: "card",
              children: [
                { type: "text", props: { text: "Info Panel" } },
                {
                  type: "markdown",
                  props: {
                    text: "### PC 端适配点\\n- 更宽的布局（row/column）\\n- 鼠标/键盘操作\\n- Resize/滚动表现"
                  }
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
    return { state, actions: [{ type: "toast", message: "Hello from PC demo" }] };
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
        { type: "button", props: { text: "Open PC Demo", event: { name: "open_page" } } }
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
        { type: "iconButton", props: { icon: "info", tooltip: "PC Demo", event: { name: "toast" } } },
        { type: "iconButton", props: { icon: "open_in_new", tooltip: "Open PC Demo", event: { name: "open_page" } } }
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

