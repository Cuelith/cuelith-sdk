import { describe, expect, it, vi } from "vitest";
import { PluginError, runPlugin, type PluginDefinition, type Transport } from "../src/index.js";

/** Motore finto: riceve le righe del modulo e gliene manda. */
function fakeEngine() {
  const sent: Record<string, unknown>[] = [];
  let toPlugin: (line: string) => void = () => undefined;
  let close: () => void = () => undefined;
  const transport: Transport = {
    send: (line) => sent.push(JSON.parse(line) as Record<string, unknown>),
    onLine: (listener) => {
      toPlugin = listener;
    },
    onClose: (listener) => {
      close = listener;
    },
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    transport,
    sent,
    deliver: async (message: object) => {
      toPlugin(JSON.stringify({ jsonrpc: "2.0", ...message }));
      await flush();
    },
    close: () => {
      close();
    },
    response: (id: number) => sent.find((m) => m.id === id && !("method" in m)),
    requests: (method: string) => sent.filter((m) => m.method === method),
  };
}

const context = {
  pluginId: "cuelith.hello",
  version: "1.0.0",
  protocol: "1.8.0",
  lang: "it",
  settings: { greeting: "Ciao" },
  permissions: ["storage"],
  dataDir: "/dati/cuelith.hello",
};

async function activated(definition: PluginDefinition) {
  const engine = fakeEngine();
  const exit = vi.fn();
  runPlugin(definition, engine.transport, { exit });
  await engine.deliver({ id: 1, method: "plugin.activate", params: { context } });
  return { engine, exit };
}

describe("runPlugin", () => {
  it("attiva il modulo col contesto ed esegue i comandi registrati", async () => {
    let seen: unknown;
    const { engine } = await activated({
      activate(ctx) {
        seen = { settings: ctx.settings, dataDir: ctx.dataDir };
        ctx.commands.register(
          "greet",
          (params) => `${String(ctx.settings.greeting)} ${String(params.name)}`,
        );
      },
    });
    expect(engine.response(1)).toMatchObject({ result: {} });
    expect(seen).toEqual({ settings: { greeting: "Ciao" }, dataDir: "/dati/cuelith.hello" });

    await engine.deliver({
      id: 2,
      method: "command.execute",
      params: { command: "greet", params: { name: "Anna" } },
    });
    expect(engine.response(2)).toMatchObject({ result: { result: "Ciao Anna" } });

    await engine.deliver({ id: 3, method: "command.execute", params: { command: "altro" } });
    expect(engine.response(3)).toMatchObject({
      error: { code: 4040, message: "core.error.commandNotFound" },
    });
  });

  it("un comando che fallisce risponde con un errore, senza far cadere il modulo", async () => {
    const { engine } = await activated({
      activate(ctx) {
        ctx.commands.register("boom", () => {
          throw new Error("rotto");
        });
        ctx.commands.register("vietato", () => {
          throw new PluginError(4220, "cuelith.hello.error.name", { name: "x" });
        });
      },
    });
    await engine.deliver({ id: 2, method: "command.execute", params: { command: "boom" } });
    expect(engine.response(2)).toMatchObject({ error: { message: "core.error.commandFailed" } });
    expect(engine.requests("log")[0]).toMatchObject({ params: { level: "error" } });
    await engine.deliver({ id: 3, method: "command.execute", params: { command: "vietato" } });
    expect(engine.response(3)).toMatchObject({
      error: { code: 4220, message: "cuelith.hello.error.name", data: { params: { name: "x" } } },
    });
    await engine.deliver({ id: 4, method: "plugin.ping", params: {} });
    // Risponde col consumo del processo (contatore delle risorse).
    const ping = engine.response(4) as { result: { memoryMB: number; cpuPercent: number } };
    expect(ping.result.memoryMB).toBeGreaterThan(0);
    expect(ping.result.cpuPercent).toBeGreaterThanOrEqual(0);
  });

  it("rifiuta un motore con un protocollo di versione maggiore diversa", async () => {
    const engine = fakeEngine();
    const activate = vi.fn();
    runPlugin({ activate }, engine.transport, { exit: vi.fn() });
    await engine.deliver({
      id: 1,
      method: "plugin.activate",
      params: { context: { ...context, protocol: "2.0.0" } },
    });
    expect(activate).not.toHaveBeenCalled();
    expect(engine.response(1)).toMatchObject({ error: { code: 4260 } });
  });

  it("un'attivazione che fallisce lo dice al motore", async () => {
    const { engine } = await activated({
      activate() {
        throw new Error("niente");
      },
    });
    expect(engine.response(1)).toMatchObject({ error: { message: "core.module.activateFailed" } });
  });

  it("chiama il motore, segue lo stato con le patch e chiede una nuova istantanea se ne perde una", async () => {
    const states: unknown[] = [];
    const { engine } = await activated({
      async activate(ctx) {
        await ctx.state.watch((s) => states.push(s));
      },
    });
    const subscribe = engine.requests("state.subscribe")[0];
    expect(subscribe).toBeDefined();
    await engine.deliver({ id: subscribe?.id as number, result: { rev: 5, state: { n: 1 } } });
    await engine.deliver({
      method: "state.patch",
      params: { rev: 6, ops: [{ op: "replace", path: "/n", value: 2 }] },
    });
    expect(states).toEqual([{ n: 1 }, { n: 2 }]);
    // rev 8 dopo la 6: ne manca una.
    await engine.deliver({
      method: "state.patch",
      params: { rev: 8, ops: [{ op: "replace", path: "/n", value: 4 }] },
    });
    expect(engine.requests("state.subscribe")).toHaveLength(2);
    expect(states).toHaveLength(2);
  });

  it("eventi: emette i propri e riceve quelli a cui si iscrive", async () => {
    const received: unknown[] = [];
    const { engine } = await activated({
      async activate(ctx) {
        ctx.events.emit("greeted", { name: "Anna" });
        const pending = ctx.events.on("core.cue.changed", (payload) => received.push(payload));
        const request = engine.requests("events.subscribe")[0];
        await engine.deliver({ id: request?.id as number, result: {} });
        await pending;
      },
    });
    expect(engine.requests("event.emit")[0]).toMatchObject({
      params: { name: "greeted", payload: { name: "Anna" } },
    });
    expect(engine.requests("events.subscribe")[0]).toMatchObject({
      params: { names: ["core.cue.changed"] },
    });
    await engine.deliver({ method: "event", params: { name: "core.cue.changed", payload: 3 } });
    expect(received).toEqual([3]);
  });

  it("storage: errori del motore come PluginError", async () => {
    let caught: unknown;
    const { engine } = await activated({
      activate(ctx) {
        ctx.storage.set("k", 1).catch((error: unknown) => {
          caught = error;
        });
      },
    });
    const request = engine.requests("storage.set")[0];
    await engine.deliver({
      id: request?.id as number,
      error: { code: 4030, message: "core.error.forbidden" },
    });
    expect(caught).toBeInstanceOf(PluginError);
    expect((caught as PluginError).code).toBe(4030);
  });

  it("si spegne dopo plugin.deactivate o se il motore sparisce", async () => {
    const deactivate = vi.fn();
    const { engine, exit } = await activated({ activate: vi.fn(), deactivate });
    await engine.deliver({ id: 2, method: "plugin.deactivate", params: {} });
    expect(deactivate).toHaveBeenCalled();
    expect(engine.response(2)).toMatchObject({ result: {} });
    expect(exit).toHaveBeenCalledWith(0);

    const other = await activated({ activate: vi.fn() });
    other.engine.close();
    expect(other.exit).toHaveBeenCalledWith(0);
  });
});
