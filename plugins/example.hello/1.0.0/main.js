function page_home_render(ctx, params = {}, state = {}) {
  const target = ctx?.target ?? "unknown";
  const clicks = Number(state.clicks ?? 0);
  const lastFetch = state.lastFetchStatus ?? "";

  return {
    title: "Hello Plugin",
    state: { ...state, clicks },
    schema: {
      type: "page",
      props: { title: "Hello Plugin" },
      children: [
        { type: "text", props: { text: `Target: ${target}` } },
        { type: "text", props: { text: `Clicks: ${clicks}` } },
        lastFetch ? { type: "text", props: { text: `Last fetch: ${lastFetch}` } } : null,
        {
          type: "button",
          props: {
            text: "Click",
            event: { name: "click" }
          }
        },
        {
          type: "button",
          props: {
            text: "Fetch httpbin.org",
            event: { name: "fetch" }
          }
        }
      ].filter(Boolean)
    }
  };
}

async function page_home_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";

  if (name === "click") {
    const clicks = Number(state.clicks ?? 0) + 1;
    return { state: { ...state, clicks } };
  }

  if (name === "fetch") {
    try {
      const res = await ctx.net.request({
        url: "https://httpbin.org/get",
        method: "GET",
        headers: {
          "User-Agent": "example.hello/1.0.0 (plugin)",
          "Accept": "application/json"
        },
        timeoutMs: 15000,
        responseType: "json",
        cookieJarId: "default"
      });

      return {
        state: {
          ...state,
          lastFetchStatus: `${res.status}`
        },
        actions: [{ type: "toast", message: `Fetch done: ${res.status}` }]
      };
    } catch (e) {
      return {
        state: { ...state, lastFetchStatus: "error" },
        actions: [{ type: "toast", message: `Fetch failed: ${String(e)}` }]
      };
    }
  }

  return { state };
}

function slot_home_render(ctx, params = {}, state = {}) {
  const placement = params?.placement ?? "";
  const clicks = Number(state.clicks ?? 0);

  return {
    state: { ...state, clicks },
    schema: {
      type: "card",
      children: [
        { type: "text", props: { text: "Slot: home.feed.beforeSections" } },
        placement ? { type: "text", props: { text: `placement: ${placement}` } } : null,
        { type: "text", props: { text: `slotClicks: ${clicks}` } },
        {
          type: "row",
          children: [
            {
              type: "button",
              props: { text: "Slot Click", event: { name: "click" } }
            },
            {
              type: "button",
              props: { text: "Open Plugin Page", event: { name: "open_page" } }
            }
          ]
        }
      ].filter(Boolean)
    }
  };
}

function slot_home_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";

  if (name === "click") {
    const clicks = Number(state.clicks ?? 0) + 1;
    return {
      state: { ...state, clicks },
      actions: [{ type: "toast", message: `Slot clicked: ${clicks}` }]
    };
  }

  if (name === "open_page") {
    return {
      state,
      actions: [{ type: "navigate", route: "/plugin/example.hello/home", params: {} }]
    };
  }

  return { state };
}

function slot_detail_actions_render(ctx, params = {}, state = {}) {
  const media = params?.media ?? {};
  const mediaTitle = media?.title ?? "";
  const mediaYear = media?.year ? String(media.year) : "";

  return {
    state,
    schema: {
      type: "row",
      children: [
        {
          type: "chip",
          props: {
            text: "Hello",
            event: { name: "toast", payload: { message: "Hello from slot" } }
          }
        },
        {
          type: "badge",
          props: { text: mediaYear ? `Year ${mediaYear}` : "Detail" }
        },
        {
          type: "button",
          props: {
            text: mediaTitle ? `Open: ${mediaTitle}` : "Open Plugin Page",
            event: { name: "open_page" }
          }
        }
      ]
    }
  };
}

function slot_detail_actions_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";
  const message = event?.payload?.message;

  if (name === "toast") {
    return {
      state,
      actions: [{ type: "toast", message: message ? String(message) : "Hello" }]
    };
  }

  if (name === "open_page") {
    return {
      state,
      actions: [{ type: "navigate", route: "/plugin/example.hello/home", params: {} }]
    };
  }

  return { state };
}

function slot_player_appbar_render(ctx, params = {}, state = {}) {
  const playback = params?.playback ?? {};
  const title = playback?.title ?? "";
  const positionMs = Number(playback?.positionMs ?? 0);
  const durationMs = Number(playback?.durationMs ?? 0);

  const prettyPos = Math.floor(positionMs / 1000);
  const prettyDur = Math.floor(durationMs / 1000);

  return {
    state,
    schema: {
      type: "row",
      children: [
        {
          type: "iconButton",
          props: {
            icon: "info",
            tooltip: "Hello Slot",
            event: {
              name: "toast",
              payload: { message: `Player: ${title || "?"} (${prettyPos}s/${prettyDur}s)` }
            }
          }
        },
        {
          type: "iconButton",
          props: {
            icon: "open_in_new",
            tooltip: "Open Plugin Page",
            event: { name: "open_page" }
          }
        }
      ]
    }
  };
}

function slot_player_appbar_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";
  const message = event?.payload?.message;

  if (name === "toast") {
    return {
      state,
      actions: [{ type: "toast", message: message ? String(message) : "Hello" }]
    };
  }

  if (name === "open_page") {
    return {
      state,
      actions: [{ type: "navigate", route: "/plugin/example.hello/home", params: {} }]
    };
  }

  return { state };
}
