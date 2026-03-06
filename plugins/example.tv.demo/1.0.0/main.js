function page_home_render(ctx, params = {}, state = {}) {
  const target = ctx?.target ?? "unknown";
  const count = Number(state.count ?? 0);

  return {
    title: "TV Demo",
    state: { ...state, count },
    schema: {
      type: "page",
      props: { title: "TV Demo" },
      children: [
        { type: "text", props: { text: `Target: ${target}` } },
        { type: "text", props: { text: "TV-only demo. Use D-pad/remote to move focus." } },
        {
          type: "column",
          children: [
            {
              type: "button",
              focusId: "tv_btn_toast",
              focusNext: { down: "tv_btn_open" },
              props: { text: "Toast", event: { name: "toast" } }
            },
            {
              type: "button",
              focusId: "tv_btn_open",
              focusNext: { up: "tv_btn_toast", down: "tv_btn_inc" },
              props: { text: "Open Plugin Page", event: { name: "open_page" } }
            },
            {
              type: "button",
              focusId: "tv_btn_inc",
              focusNext: { up: "tv_btn_open" },
              props: { text: `Count +1 (${count})`, event: { name: "inc" } }
            }
          ]
        }
      ]
    }
  };
}

function page_home_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";

  if (name === "toast") {
    return { state, actions: [{ type: "toast", message: "Hello from TV demo" }] };
  }

  if (name === "open_page") {
    return {
      state,
      actions: [{ type: "navigate", route: "/plugin/example.tv.demo/home", params: {} }]
    };
  }

  if (name === "inc") {
    const count = Number(state.count ?? 0) + 1;
    return { state: { ...state, count } };
  }

  return { state };
}

function slot_home_render(ctx, params = {}, state = {}) {
  return {
    state,
    schema: {
      type: "card",
      children: [
        { type: "text", props: { text: "TV Slot: home.feed.beforeSections" } },
        {
          type: "row",
          children: [
            { type: "button", props: { text: "Open", event: { name: "open_page" } } },
            { type: "button", props: { text: "Toast", event: { name: "toast" } } }
          ]
        }
      ]
    }
  };
}

function slot_home_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";
  if (name === "toast") {
    return { state, actions: [{ type: "toast", message: "TV slot says hi" }] };
  }
  if (name === "open_page") {
    return { state, actions: [{ type: "navigate", route: "/plugin/example.tv.demo/home", params: {} }] };
  }
  return { state };
}

function slot_player_appbar_render(ctx, params = {}, state = {}) {
  const title = params?.playback?.title ?? "";
  return {
    state,
    schema: {
      type: "row",
      children: [
        {
          type: "iconButton",
          props: {
            icon: "info",
            tooltip: "TV Demo",
            event: { name: "toast", payload: { message: `Playing: ${title || "?"}` } }
          }
        },
        {
          type: "iconButton",
          props: {
            icon: "open_in_new",
            tooltip: "Open TV Demo",
            event: { name: "open_page" }
          }
        }
      ]
    }
  };
}

function slot_player_appbar_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";
  if (name === "toast") {
    const message = event?.payload?.message;
    return { state, actions: [{ type: "toast", message: message ? String(message) : "TV demo" }] };
  }
  if (name === "open_page") {
    return { state, actions: [{ type: "navigate", route: "/plugin/example.tv.demo/home", params: {} }] };
  }
  return { state };
}

