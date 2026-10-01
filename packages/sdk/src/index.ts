import { format } from "node:util";
import {
  applyStatePatch,
  ErrorCode,
  isNextRev,
  isProtocolCompatible,
  PROTOCOL_VERSION,
  type EngineMethodName,
  type EngineMethodParams,
  type EngineMethodResult,
  type JsonPatchOperation,
  type Lang,
  type Permission,
  type RpcErrorObject,
  type RpcId,
  type StateDocument,
} from "@cuelith/protocol";

// Modulo con codice (runtime "node", cap. 21 e 24): il motore lo avvia in un
// processo separato, con i permessi approvati dall'utente, e ci parla con
// righe JSON-RPC su stdin/stdout. Questo pacchetto nasconde il protocollo:
// il modulo scrive solo `export default definePlugin({ activate(ctx) {...} })`.

export type SettingValue = string | number | boolean;

/** Errore restituito dal motore o da un comando: chiave di traduzione + codice. */
export class PluginError extends Error {
  readonly code: number;
  readonly params: Readonly<Record<string, string>>;

  constructor(code: number, message: string, params: Readonly<Record<string, string>> = {}) {
    super(message);
    this.name = "PluginError";
    this.code = code;
    this.params = params;
  }
}

export type CommandHandler = (params: Readonly<Record<string, unknown>>) => unknown;
export type EventHandler = (payload: unknown, name: string) => void;

/** Cio' che il modulo riceve all'attivazione. */
export interface PluginContext {
  readonly pluginId: string;
  readonly version: string;
  /** Versione del protocollo del motore. */
  readonly protocol: string;
  readonly lang: Lang;
  readonly settings: Readonly<Record<string, SettingValue>>;
  /** Permessi approvati dall'utente: il processo non puo' andare oltre. */
  readonly permissions: readonly Permission[];
  /** Cartella privata del modulo, sempre leggibile e scrivibile. */
  readonly dataDir: string;
  readonly engine: {
    /** Comando al motore; solo quelli consentiti ai moduli (altrimenti 4030). */
    call<N extends EngineMethodName>(
      method: N,
      params?: EngineMethodParams<N>,
    ): Promise<EngineMethodResult<N>>;
  };
  readonly commands: {
    /** Gestore di un comando dichiarato in contributes.commands (id locale). */
    register(id: string, handler: CommandHandler): void;
  };
  readonly events: {
    /** Evento dichiarato in contributes.events (id locale). */
    emit(name: string, payload?: unknown): void;
    /** Eventi del nucleo ("core.cue.changed") o di altri moduli (nome completo). */
    on(name: string, handler: EventHandler): Promise<() => void>;
  };
  readonly state: {
    /** Ultimo stato ricevuto (dopo watch), altrimenti undefined. */
    current(): StateDocument | undefined;
    /** Chiamata a ogni cambio dello stato dello show; restituisce la funzione per smettere. */
    watch(listener: (state: StateDocument) => void): Promise<() => void>;
  };
  /** Spazio dati del modulo nel motore (permesso "storage"). */
  readonly storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
  };
  readonly log: Readonly<Record<"debug" | "info" | "warn" | "error", (message: string) => void>>;
}

export interface PluginDefinition {
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

/** Collegamento al motore: nelle prove si sostituisce a stdin/stdout. */
export interface Transport {
  send(line: string): void;
  onLine(listener: (line: string) => void): void;
  onClose(listener: () => void): void;
}

export interface RuntimeOptions {
  /** Chiamata quando il processo deve finire (dopo plugin.deactivate o se il motore sparisce). */
  readonly exit: (code: number) => void;
}

interface Pending {
  resolve(result: unknown): void;
  reject(error: Error): void;
}

type Message = Readonly<{
  id?: RpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: RpcErrorObject;
}>;

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * Fa girare un modulo su un collegamento. Lo usa definePlugin nel processo
 * avviato dal motore; le prove lo chiamano direttamente.
 */
export function runPlugin(
  definition: PluginDefinition,
  transport: Transport,
  options: RuntimeOptions,
): void {
  const pending = new Map<RpcId, Pending>();
  const commands = new Map<string, CommandHandler>();
  const listeners = new Map<string, Set<EventHandler>>();
  const watchers = new Set<(state: StateDocument) => void>();
  let nextId = 1;
  let ctx: PluginContext | undefined;
  let state: { rev: number; doc: StateDocument } | undefined;
  let subscribing: Promise<void> | undefined;

  const send = (message: object) => {
    transport.send(JSON.stringify({ jsonrpc: "2.0", ...message }));
  };
  const notify = (method: string, params: unknown) => {
    send({ method, params });
  };
  const log = (level: "debug" | "info" | "warn" | "error", message: string) => {
    notify("log", { level, message });
  };

  const call = (method: string, params: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      send({ id, method, params: params ?? {} });
    });

  const subscribe = (): Promise<void> => {
    subscribing ??= (call("state.subscribe", {}) as Promise<{ rev: number; state: StateDocument }>)
      .then((snapshot) => {
        state = { rev: snapshot.rev, doc: snapshot.state };
        for (const watcher of watchers) watcher(snapshot.state);
      })
      .finally(() => {
        subscribing = undefined;
      });
    return subscribing;
  };

  const onPatch = (params: unknown) => {
    const { rev, ops } = asRecord(params) as { rev?: number; ops?: JsonPatchOperation[] };
    if (state === undefined || typeof rev !== "number" || !Array.isArray(ops)) return;
    if (!isNextRev(state.rev, rev)) {
      // Persa una patch: si riparte da una nuova istantanea (cap. 23).
      if (rev > state.rev) void subscribe().catch(() => undefined);
      return;
    }
    try {
      state = { rev, doc: applyStatePatch(state.doc, ops) };
    } catch {
      void subscribe().catch(() => undefined);
      return;
    }
    for (const watcher of watchers) watcher(state.doc);
  };

  const subscribedEvents = () => call("events.subscribe", { names: [...listeners.keys()] });

  const makeContext = (raw: Readonly<Record<string, unknown>>): PluginContext => ({
    pluginId: raw.pluginId as string,
    version: raw.version as string,
    protocol: raw.protocol as string,
    lang: raw.lang as Lang,
    settings: asRecord(raw.settings) as Record<string, SettingValue>,
    permissions: (raw.permissions ?? []) as Permission[],
    dataDir: raw.dataDir as string,
    engine: {
      call: (method, params) => call(method, params) as Promise<never>,
    },
    commands: {
      register: (id, handler) => {
        commands.set(id, handler);
      },
    },
    events: {
      emit: (name, payload) => {
        notify("event.emit", payload === undefined ? { name } : { name, payload });
      },
      on: async (name, handler) => {
        const set = listeners.get(name) ?? new Set();
        const isNew = set.size === 0;
        set.add(handler);
        listeners.set(name, set);
        if (isNew) await subscribedEvents();
        return () => {
          set.delete(handler);
          if (set.size === 0) {
            listeners.delete(name);
            void subscribedEvents().catch(() => undefined);
          }
        };
      },
    },
    state: {
      current: () => state?.doc,
      watch: async (listener) => {
        watchers.add(listener);
        if (state === undefined) await subscribe();
        else listener(state.doc);
        return () => {
          watchers.delete(listener);
        };
      },
    },
    storage: {
      get: async (key) => {
        const result = (await call("storage.get", { key })) as { found: boolean; value?: unknown };
        return result.found ? result.value : undefined;
      },
      set: async (key, value) => {
        await call("storage.set", { key, value });
      },
      delete: async (key) => {
        await call("storage.delete", { key });
      },
    },
    log: {
      debug: (m) => {
        log("debug", m);
      },
      info: (m) => {
        log("info", m);
      },
      warn: (m) => {
        log("warn", m);
      },
      error: (m) => {
        log("error", m);
      },
    },
  });

  const reply = (id: RpcId, result: unknown) => {
    send({ id, result });
  };
  const fail = (id: RpcId, code: number, message: string, params?: Record<string, string>) => {
    send({ id, error: { code, message, ...(params === undefined ? {} : { data: { params } }) } });
  };
  const describe = (error: unknown) =>
    error instanceof Error ? (error.stack ?? error.message) : String(error);

  const onRequest = async (id: RpcId, method: string, params: unknown) => {
    const p = asRecord(params);
    switch (method) {
      case "plugin.ping":
        reply(id, {});
        return;
      case "plugin.activate": {
        const raw = asRecord(p.context);
        if (typeof raw.protocol !== "string" || !isProtocolCompatible(raw.protocol)) {
          fail(id, ErrorCode.ProtocolIncompatible, "core.error.protocolIncompatible", {
            expected: PROTOCOL_VERSION,
          });
          return;
        }
        ctx = makeContext(raw);
        try {
          await definition.activate(ctx);
          reply(id, {});
        } catch (error) {
          log("error", `attivazione non riuscita: ${describe(error)}`);
          fail(id, ErrorCode.InternalError, "core.module.activateFailed");
        }
        return;
      }
      case "plugin.deactivate":
        try {
          await definition.deactivate?.();
        } catch (error) {
          log("error", `disattivazione non riuscita: ${describe(error)}`);
        }
        reply(id, {});
        options.exit(0);
        return;
      case "command.execute": {
        const handler = typeof p.command === "string" ? commands.get(p.command) : undefined;
        if (ctx === undefined || handler === undefined) {
          fail(id, ErrorCode.NotFound, "core.error.commandNotFound");
          return;
        }
        try {
          const result: unknown = await handler(asRecord(p.params));
          reply(id, { result: result ?? null });
        } catch (error) {
          if (error instanceof PluginError) {
            fail(id, error.code, error.message, { ...error.params });
            return;
          }
          log("error", `comando ${String(p.command)} non riuscito: ${describe(error)}`);
          fail(id, ErrorCode.InternalError, "core.error.commandFailed");
        }
        return;
      }
      default:
        fail(id, ErrorCode.MethodNotFound, "core.error.methodNotFound");
    }
  };

  transport.onLine((line) => {
    let message: Message;
    try {
      message = JSON.parse(line) as Message;
    } catch {
      return;
    }
    if (typeof message.method === "string") {
      if (message.id === undefined) {
        if (message.method === "state.patch") onPatch(message.params);
        else if (message.method === "event") {
          const { name, payload } = asRecord(message.params) as {
            name?: string;
            payload?: unknown;
          };
          if (typeof name !== "string") return;
          for (const handler of listeners.get(name) ?? []) {
            try {
              handler(payload, name);
            } catch (error) {
              log("error", `gestore dell'evento ${name}: ${describe(error)}`);
            }
          }
        }
        return;
      }
      void onRequest(message.id, message.method, message.params);
      return;
    }
    if (message.id === undefined) return;
    const waiting = pending.get(message.id);
    pending.delete(message.id);
    if (waiting === undefined) return;
    if (message.error !== undefined) {
      waiting.reject(
        new PluginError(message.error.code, message.error.message, message.error.data?.params),
      );
    } else waiting.resolve(message.result);
  });

  // Senza motore il modulo non ha motivo di restare acceso.
  transport.onClose(() => {
    options.exit(0);
  });
}

/** Righe JSON su stdin/stdout del processo avviato dal motore. */
export function stdioTransport(): Transport {
  let buffer = "";
  const lineListeners: ((line: string) => void)[] = [];
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line !== "") for (const listener of lineListeners) listener(line);
      index = buffer.indexOf("\n");
    }
  });
  return {
    send: (line) => {
      process.stdout.write(`${line}\n`);
    },
    onLine: (listener) => {
      lineListeners.push(listener);
    },
    onClose: (listener) => {
      process.stdin.on("end", listener);
    },
  };
}

/**
 * stdout appartiene al protocollo: console.log e simili diventano righe di
 * log del motore, cosi' un modulo non lo puo' rompere per sbaglio.
 */
function routeConsole(transport: Transport): void {
  const levels = {
    debug: "debug",
    log: "info",
    info: "info",
    warn: "warn",
    error: "error",
  } as const;
  for (const [name, level] of Object.entries(levels)) {
    (console as unknown as Record<string, (...args: unknown[]) => void>)[name] = (
      ...args: unknown[]
    ) => {
      transport.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "log",
          params: { level, message: format(...args) },
        }),
      );
    };
  }
}

let started = false;

/**
 * Definisce il modulo. Nel processo avviato dal motore (CUELITH_PLUGIN=1) lo
 * mette anche in funzione; altrove (prove, strumenti) restituisce solo la
 * definizione.
 */
export function definePlugin(definition: PluginDefinition): PluginDefinition {
  if (process.env.CUELITH_PLUGIN === "1" && !started) {
    started = true;
    const transport = stdioTransport();
    routeConsole(transport);
    process.on("uncaughtException", (error) => {
      transport.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "log",
          params: {
            level: "error",
            message: `errore non gestito: ${error.stack ?? error.message}`,
          },
        }),
      );
      process.exitCode = 1;
      // Si esce dopo aver scritto la riga: il motore vede il crash e decide se riavviare.
      process.stdout.write("", () => process.exit(1));
    });
    runPlugin(definition, transport, {
      exit: (code) => {
        process.stdout.write("", () => process.exit(code));
      },
    });
  }
  return definition;
}
