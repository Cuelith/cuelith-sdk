import {
  HostToPanelSchema,
  PANEL_CONNECT,
  PANEL_HOST_METHODS,
  translate,
  type Catalog,
  type EngineMethodName,
  type EngineMethodParams,
  type EngineMethodResult,
  type Lang,
  type MessageParams,
  type StateDocument,
} from "@cuelith/protocol";

/** Errore di un comando: chiave di traduzione + codice del protocollo. */
export class PanelCallError extends Error {
  readonly code: number;
  readonly params: Readonly<Record<string, string>>;

  constructor(error: {
    code: number;
    message: string;
    data?: { params?: Readonly<Record<string, string>> | undefined } | undefined;
  }) {
    super(error.message);
    this.name = "PanelCallError";
    this.code = error.code;
    this.params = error.data?.params ?? {};
  }
}

/** Il pannello collegato alla postazione. */
export interface Panel {
  readonly pluginId: string;
  readonly panelId: string;
  /** Lingua attiva della postazione. */
  readonly lang: Lang;
  /** Stato attuale dello show (sola lettura). */
  readonly state: StateDocument;
  /** Contesto passato da chi ha aperto il pannello (es. l'id del canto da modificare). */
  readonly context: unknown;
  /** Testo tradotto di una chiave del modulo. */
  t(key: string, params?: MessageParams): string;
  /** Comando al motore; solo quelli consentiti ai moduli (altrimenti 4030). */
  call<N extends EngineMethodName>(
    method: N,
    params: EngineMethodParams<N>,
  ): Promise<EngineMethodResult<N>>;
  /** Avviso all'operatore nella postazione (chiave del modulo). */
  notify(key: string, params?: Readonly<Record<string, string>>): Promise<void>;
  /** Chiude il pannello (per i pannelli al centro). */
  close(): Promise<void>;
  /** Apre un altro pannello del modulo passandogli un contesto. */
  openPanel(panelId: string, context?: unknown): Promise<void>;
  /** Fa salvare un file all'operatore (la postazione chiede dove). */
  saveFile(name: string, content: string, mime: string): Promise<void>;
  /** Chiamata a ogni cambio dello stato; restituisce la funzione per smettere. */
  onState(listener: (state: StateDocument) => void): () => void;
  /** Chiamata quando cambia la lingua o i testi. */
  onLanguage(listener: (lang: Lang) => void): () => void;
}

interface Pending {
  resolve(result: unknown): void;
  reject(error: Error): void;
}

/** Minimo indispensabile di `window`: si puo' sostituire nelle prove. */
export interface ConnectTarget {
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

/**
 * Collega il pannello alla postazione. Il pannello gira in un iframe isolato:
 * la postazione gli consegna una porta privata e da li' passano stato, testi e
 * comandi. Si chiama una volta, all'avvio del pannello.
 */
export function connectPanel(target: ConnectTarget = window): Promise<Panel> {
  return new Promise((resolve) => {
    const onConnect = (event: MessageEvent) => {
      const data = event.data as { type?: unknown } | null;
      const port = event.ports[0];
      if (data?.type !== PANEL_CONNECT || port === undefined) return;
      target.removeEventListener("message", onConnect);
      start(port, resolve);
    };
    target.addEventListener("message", onConnect);
  });
}

function start(port: MessagePort, ready: (panel: Panel) => void): void {
  const pending = new Map<number, Pending>();
  const stateListeners = new Set<(state: StateDocument) => void>();
  const langListeners = new Set<(lang: Lang) => void>();
  let next = 1;
  let info:
    | {
        pluginId: string;
        panelId: string;
        lang: Lang;
        catalog: Catalog;
        state: StateDocument;
        context: unknown;
      }
    | undefined;

  const send = (method: string, params: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = next++;
      pending.set(id, { resolve, reject });
      port.postMessage({ type: "call", id, method, params });
    });

  port.onmessage = (event: MessageEvent) => {
    const parsed = HostToPanelSchema.safeParse(event.data);
    if (!parsed.success) return;
    const message = parsed.data;
    if (message.type === "init") {
      info = {
        pluginId: message.pluginId,
        panelId: message.panelId,
        lang: message.lang,
        catalog: message.catalog,
        state: message.state,
        context: message.context,
      };
      const current = () => {
        if (info === undefined) throw new Error("pannello non collegato");
        return info;
      };
      ready({
        get pluginId() {
          return current().pluginId;
        },
        get panelId() {
          return current().panelId;
        },
        get lang() {
          return current().lang;
        },
        get state() {
          return current().state;
        },
        get context() {
          return current().context;
        },
        t: (key, params) => translate(current().catalog, current().lang, key, params),
        call: (method, params) => send(method, params) as Promise<never>,
        notify: async (key, params) => {
          await send(PANEL_HOST_METHODS.notify, { key, params: params ?? {} });
        },
        close: async () => {
          await send(PANEL_HOST_METHODS.close, {});
        },
        openPanel: async (panel, context) => {
          await send(PANEL_HOST_METHODS.openPanel, { panel, context });
        },
        saveFile: async (name, content, mime) => {
          await send(PANEL_HOST_METHODS.saveFile, { name, content, mime });
        },
        onState: (listener) => {
          stateListeners.add(listener);
          return () => stateListeners.delete(listener);
        },
        onLanguage: (listener) => {
          langListeners.add(listener);
          return () => langListeners.delete(listener);
        },
      });
      return;
    }
    if (info === undefined) return;
    if (message.type === "state") {
      info = { ...info, state: message.state };
      for (const listener of stateListeners) listener(message.state);
    } else if (message.type === "catalog") {
      info = { ...info, lang: message.lang, catalog: message.catalog };
      for (const listener of langListeners) listener(message.lang);
    } else {
      const call = pending.get(message.id);
      if (call === undefined) return;
      pending.delete(message.id);
      if (message.type === "result") call.resolve(message.result);
      else call.reject(new PanelCallError(message.error));
    }
  };
}
