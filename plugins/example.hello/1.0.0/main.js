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

