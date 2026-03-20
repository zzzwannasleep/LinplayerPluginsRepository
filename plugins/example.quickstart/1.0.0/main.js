const QUICKSTART_ROUTE = "/plugin/example.quickstart/home";

function page_home_render(ctx, params = {}, state = {}) {
  const count = Number(state.count ?? 0);
  const target = ctx?.target ?? "unknown";

  return {
    title: "Quickstart",
    state: { ...state, count },
    schema: {
      type: "page",
      props: { gap: 12 },
      children: [
        { type: "text", props: { text: "Quickstart Plugin", bold: true, size: 18 } },
        { type: "text", props: { text: "这是一个最小教程型示例插件。" } },
        {
          type: "card",
          children: [
            {
              type: "column",
              props: { gap: 8 },
              children: [
                { type: "text", props: { text: "这个插件演示什么", bold: true } },
                { type: "text", props: { text: "1. manifest.json 声明页面和插槽" } },
                { type: "text", props: { text: "2. main.js 里的 render() 负责返回 UI Schema" } },
                { type: "text", props: { text: "3. onEvent() 负责处理点击并返回 actions" } }
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
                { type: "text", props: { text: "交互示例", bold: true } },
                { type: "text", props: { text: `当前目标端: ${target}` } },
                { type: "text", props: { text: `按钮点击次数: ${count}` } },
                {
                  type: "row",
                  props: { gap: 8 },
                  children: [
                    { type: "button", props: { text: "+1", event: { name: "increment" } } },
                    {
                      type: "button",
                      props: {
                        text: "Toast",
                        event: { name: "toast", payload: { message: "Quickstart says hello" } }
                      }
                    }
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
                { type: "text", props: { text: "宿主传入的 params", bold: true } },
                {
                  type: "markdown",
                  props: {
                    text: "```json\n" + JSON.stringify(params ?? {}, null, 2) + "\n```",
                    selectable: true
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

  if (name === "increment") {
    return {
      state: { ...state, count: Number(state.count ?? 0) + 1 }
    };
  }

  if (name === "toast") {
    const message = event?.payload?.message;
    return {
      state,
      actions: [{ type: "toast", message: message ? String(message) : "Quickstart" }]
    };
  }

  return { state };
}

function slot_home_render(ctx, params = {}, state = {}) {
  const page = params?.page ?? "home";

  return {
    state,
    schema: {
      type: "card",
      children: [
        {
          type: "column",
          props: { gap: 8 },
          children: [
            { type: "text", props: { text: "Quickstart 首页入口", bold: true } },
            { type: "text", props: { text: `宿主页面: ${page}` } },
            {
              type: "row",
              props: { gap: 8 },
              children: [
                { type: "button", props: { text: "打开示例页", event: { name: "open_page" } } },
                { type: "button", props: { text: "Toast", event: { name: "toast" } } }
              ]
            }
          ]
        }
      ]
    }
  };
}

function slot_home_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";

  if (name === "open_page") {
    return {
      state,
      actions: [{ type: "navigate", route: QUICKSTART_ROUTE, params: {} }]
    };
  }

  if (name === "toast") {
    return {
      state,
      actions: [{ type: "toast", message: "Hello from quickstart home slot" }]
    };
  }

  return { state };
}

function slot_detail_actions_render(ctx, params = {}, state = {}) {
  const media = params?.media ?? {};
  const title = media?.title ?? "";
  const year = media?.year ? String(media.year) : "";

  return {
    state,
    schema: {
      type: "row",
      props: { gap: 8 },
      children: [
        {
          type: "badge",
          props: { text: year ? `Year ${year}` : "Quickstart" }
        },
        {
          type: "button",
          props: {
            text: title ? `打开 ${title}` : "打开示例页",
            event: { name: "open_page" }
          }
        }
      ]
    }
  };
}

function slot_detail_actions_onEvent(ctx, event = {}, state = {}) {
  const name = event?.name ?? "";

  if (name === "open_page") {
    return {
      state,
      actions: [{ type: "navigate", route: QUICKSTART_ROUTE, params: {} }]
    };
  }

  return { state };
}
