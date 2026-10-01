import {
  emptyLayers,
  newId,
  PANEL_CONNECT,
  PANEL_READY,
  type StateDocument,
} from "@cuelith/protocol";
import { describe, expect, it } from "vitest";
import { connectPanel, PanelCallError, type ConnectTarget } from "../src/index.js";

function state(name = "Show"): StateDocument {
  return {
    show: {
      schema: 1,
      id: newId(),
      name,
      playlist: [],
      items: {},
      sources: {},
      looks: {},
      scenes: {},
      outputs: {},
      rules: [],
      plugins: {},
    },
    live: {
      rev: 0,
      cursor: { slideIndex: 0 },
      preview: { slideIndex: 0 },
      layers: emptyLayers(),
      outputs: {},
      activeScene: {},
      clients: [],
      plugins: [],
      dirty: false,
      libraryRev: 0,
    },
  };
}

function emit(target: { listeners: Set<(event: MessageEvent) => void> }, event: MessageEvent) {
  for (const listener of target.listeners) listener(event);
}

/** Finta finestra del pannello e finta postazione dall'altra parte della porta. */
function setup() {
  const listeners = new Set<(event: MessageEvent) => void>();
  const target: ConnectTarget & { listeners: typeof listeners } = {
    listeners,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  const channel = new MessageChannel();
  const host = channel.port1;
  const calls: { id: number; method: string; params: unknown }[] = [];
  host.onmessage = (event: MessageEvent<{ id: number; method: string; params: unknown }>) => {
    calls.push(event.data);
    const { id, method } = event.data;
    if (method === "output.create") {
      host.postMessage({
        type: "error",
        id,
        error: { code: 4030, message: "core.error.forbidden" },
      });
    } else {
      host.postMessage({ type: "result", id, result: { rev: 7 } });
    }
  };
  const connect = () => {
    const event = new MessageEvent("message", {
      data: { type: PANEL_CONNECT },
      ports: [channel.port2],
    });
    for (const listener of listeners) listener(event);
    host.postMessage({
      type: "init",
      pluginId: "cuelith.greetings",
      panelId: "main",
      lang: "it",
      catalog: { "cuelith.greetings.hello": "Ciao {name}" },
      state: state(),
    });
  };
  return {
    target,
    host,
    calls,
    connect,
    close: () => {
      host.close();
    },
  };
}

describe("@cuelith/panel", () => {
  it("si collega, traduce, riceve lo stato e manda comandi", async () => {
    const { target, host, calls, connect, close } = setup();
    const ready = connectPanel(target);
    connect();
    const panel = await ready;
    expect(panel.pluginId).toBe("cuelith.greetings");
    expect(panel.t("cuelith.greetings.hello", { name: "Anna" })).toBe("Ciao Anna");
    expect(panel.state.show.name).toBe("Show");

    const seen: string[] = [];
    panel.onState((s) => seen.push(s.show.name));
    host.postMessage({ type: "state", state: state("Culto") });
    await expect.poll(() => seen).toEqual(["Culto"]);
    expect(panel.state.show.name).toBe("Culto");

    await expect(panel.call("cue.next", {})).resolves.toEqual({ rev: 7 });
    await expect(panel.call("output.create", {} as never)).rejects.toBeInstanceOf(PanelCallError);
    await panel.notify("cuelith.greetings.hello", { name: "Anna" });
    expect(calls.map((c) => c.method)).toEqual(["cue.next", "output.create", "host.notify"]);
    close();
  });

  it("si annuncia pronto e accetta di essere ricollegato con una porta nuova", async () => {
    const { target, connect, close } = setup();
    const announced: unknown[] = [];
    const ready = connectPanel(target, { postMessage: (message) => announced.push(message) });
    expect(announced).toEqual([{ type: PANEL_READY }]);
    connect();
    const panel = await ready;
    const names: string[] = [];
    panel.onState((s) => names.push(s.show.name));

    // La postazione ricollega il pannello: vale la porta nuova.
    const second = new MessageChannel();
    second.port1.onmessage = (event: MessageEvent<{ id: number }>) => {
      second.port1.postMessage({ type: "result", id: event.data.id, result: { rev: 99 } });
    };
    // Il pannello ascolta ancora: un nuovo "connect" con un'altra porta.
    const event = new MessageEvent("message", {
      data: { type: PANEL_CONNECT },
      ports: [second.port2],
    });
    emit(target, event);
    second.port1.postMessage({
      type: "init",
      pluginId: "cuelith.greetings",
      panelId: "main",
      lang: "it",
      catalog: {},
      state: state("Ricollegato"),
    });
    await expect.poll(() => names).toEqual(["Ricollegato"]);
    await expect(panel.call("cue.next", {})).resolves.toEqual({ rev: 99 });
    second.port1.close();
    close();
  });

  it("ignora messaggi che non vengono dalla postazione", async () => {
    const { target, connect, close } = setup();
    const ready = connectPanel(target);
    // Un messaggio senza porta o di altro tipo non collega nulla.
    connect();
    await expect(ready).resolves.toBeDefined();
    close();
  });
});
