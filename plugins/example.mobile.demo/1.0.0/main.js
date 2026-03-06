function page_home_render(ctx, params = {}, state = {}) {
  const target = ctx?.target ?? "unknown";
  const taps = Number(state.taps ?? 0);

  return {
    title: "Mobile Demo",
    state: { ...state, taps },
    schema: {
      type: "page",
      props: { title: "Mobile Demo" },
      children: [
        { type: "text", props: { text: `Target: ${target}` } },
        { type: "text", props: { text: "Mobile-only demo. Designed for touch + small screens." } },
        {
          type: "card",
          children: [
            { type: "text", props: { text: `Tap count: ${taps}` } },
            { type: "button", props: { text: "Tap +1", event: { name: "tap" } } },
            { type: "button", props: { text: "Toast", event: { name: "toast" } } }
          ]
        }
      ]
    }
  };
}

function page_home_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";

  if (name === "tap") {
    const taps = Number(state.taps ?? 0) + 1;
    return { state: { ...state, taps } };
  }

  if (name === "toast") {
    return { state, actions: [{ type: "toast", message: "Hello from Mobile demo" }] };
  }

  return { state };
}

function slot_home_after_render(ctx, params = {}, state = {}) {
  return {
    state,
    schema: {
      type: "card",
      children: [
        { type: "text", props: { text: "Mobile Slot: home.feed.afterSections" } },
        { type: "button", props: { text: "Open Mobile Demo", event: { name: "open_page" } } }
      ]
    }
  };
}

function slot_home_after_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";
  if (name === "open_page") {
    return { state, actions: [{ type: "navigate", route: "/plugin/example.mobile.demo/home", params: {} }] };
  }
  return { state };
}

function slot_detail_actions_render(ctx, params = {}, state = {}) {
  const mediaTitle = params?.media?.title ?? "";
  return {
    state,
    schema: {
      type: "row",
      children: [
        { type: "chip", props: { text: "Mobile", event: { name: "toast" } } },
        { type: "badge", props: { text: mediaTitle ? "Detail" : "Detail?" } },
        { type: "button", props: { text: "Open", event: { name: "open_page" } } }
      ]
    }
  };
}

function slot_detail_actions_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";
  if (name === "toast") {
    return { state, actions: [{ type: "toast", message: "Mobile detail action" }] };
  }
  if (name === "open_page") {
    return { state, actions: [{ type: "navigate", route: "/plugin/example.mobile.demo/home", params: {} }] };
  }
  return { state };
}

