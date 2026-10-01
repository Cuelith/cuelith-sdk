import {
  CUE_KEYS,
  PANEL_CONNECT,
  PANEL_READY,
  PANEL_HOST_METHODS,
  translate,
  type Catalog,
  type EngineMethodName,
  type EngineMethodParams,
  type EngineMethodResult,
  type HostToPanel,
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

/** A chi annunciare che il pannello e' pronto (la postazione); sostituibile nelle prove. */
export interface AnnounceTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

/**
 * Collega il pannello alla postazione. Il pannello gira in un iframe isolato:
 * la postazione gli consegna una porta privata e da li' passano stato, testi e
 * comandi. Si chiama una volta, all'avvio del pannello: annuncia subito che e'
 * pronto (PANEL_READY), cosi' funziona anche se la pagina finisce di
 * caricarsi dopo (es. `await connectPanel()` in cima allo script). Se la
 * postazione lo ricollega, vale la porta nuova.
 */
export function connectPanel(
  target: ConnectTarget = window,
  announce: AnnounceTarget | undefined = typeof window === "undefined" ? undefined : window.parent,
): Promise<Panel> {
  return new Promise((resolve) => {
    const connection = createConnection(resolve);
    target.addEventListener("message", (event: MessageEvent) => {
      const data = event.data as { type?: unknown } | null;
      const port = event.ports[0];
      if (data?.type !== PANEL_CONNECT || port === undefined) return;
      connection.attach(port);
    });
    // Origine opaca (sandbox): l'annuncio non contiene nulla di riservato.
    announce?.postMessage({ type: PANEL_READY }, "*");
  });
}

/**
 * Messaggio della postazione. Si controlla solo la forma che serve qui, MAI
 * tutto lo stato: una postazione piu' nuova puo' mandare campi che questa
 * versione della libreria non conosce (protocollo piu' recente), e il
 * pannello deve partire lo stesso. I campi sconosciuti si ignorano.
 */
function hostMessage(data: unknown): HostToPanel | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const message = data as Record<string, unknown>;
  const isObject = (value: unknown) => typeof value === "object" && value !== null;
  switch (message.type) {
    case "init":
      return typeof message.pluginId === "string" &&
        typeof message.panelId === "string" &&
        typeof message.lang === "string" &&
        isObject(message.catalog) &&
        isObject(message.state)
        ? (message as HostToPanel)
        : undefined;
    case "state":
      return isObject(message.state) ? (message as HostToPanel) : undefined;
    case "catalog":
      return typeof message.lang === "string" && isObject(message.catalog)
        ? (message as HostToPanel)
        : undefined;
    case "result":
      return typeof message.id === "number" ? (message as HostToPanel) : undefined;
    case "error":
      return typeof message.id === "number" && isObject(message.error)
        ? (message as HostToPanel)
        : undefined;
    default:
      return undefined;
  }
}

const CUE_KEY_SET: ReadonlySet<string> = new Set(CUE_KEYS);

/**
 * I tasti della regia (frecce, Invio, Esc, V C P B I E O...) premuti nel
 * pannello, fuori da un campo di testo, vanno alla postazione: il pannello e'
 * isolato e senza questo li "mangerebbe" dopo ogni clic. Spazio e Invio
 * restano al pulsante del pannello solo se ci si e' arrivati con la tastiera
 * (dopo un clic col mouse comandano la regia, come nella postazione).
 */
function forwardCueKeys(forward: (key: string) => void): void {
  if (typeof window === "undefined") return;
  let keyboardFocused: Element | null = null;
  let lastInputWasKeyboard = false;
  window.addEventListener(
    "pointerdown",
    () => {
      lastInputWasKeyboard = false;
    },
    true,
  );
  window.addEventListener(
    "keydown",
    () => {
      lastInputWasKeyboard = true;
    },
    true,
  );
  window.addEventListener(
    "focusin",
    (event) => {
      keyboardFocused =
        lastInputWasKeyboard && event.target instanceof Element ? event.target : null;
    },
    true,
  );
  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (!CUE_KEY_SET.has(key)) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      if (target.isContentEditable || target.closest("input, textarea, select") !== null) return;
      const control = target.closest("button, a[href], summary, [role='button']");
      if ((key === " " || key === "Enter") && control !== null && control === keyboardFocused) {
        return;
      }
    }
    event.preventDefault();
    forward(key);
  });
}

function createConnection(ready: (panel: Panel) => void): { attach(port: MessagePort): void } {
  let port: MessagePort | undefined;
  let resolved = false;
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
      if (port === undefined) {
        reject(new Error("pannello non collegato"));
        return;
      }
      const id = next++;
      pending.set(id, { resolve, reject });
      port.postMessage({ type: "call", id, method, params });
    });

  const onMessage = (event: MessageEvent) => {
    const message = hostMessage(event.data);
    if (message === undefined) return;
    if (message.type === "init") {
      const reconnected = resolved;
      info = {
        pluginId: message.pluginId,
        panelId: message.panelId,
        lang: message.lang,
        catalog: message.catalog,
        state: message.state,
        context: message.context,
      };
      // Ricollegato: stessi ascoltatori, stato e testi aggiornati.
      if (reconnected) {
        for (const listener of stateListeners) listener(message.state);
        for (const listener of langListeners) listener(message.lang);
        return;
      }
      resolved = true;
      const current = () => {
        if (info === undefined) throw new Error("pannello non collegato");
        return info;
      };
      forwardCueKeys((key) => {
        void send(PANEL_HOST_METHODS.key, { key }).catch(() => undefined);
      });
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

  return {
    attach: (next) => {
      // Le chiamate in corso sulla porta vecchia non avranno risposta.
      for (const call of pending.values()) call.reject(new Error("pannello ricollegato"));
      pending.clear();
      port?.close();
      port = next;
      port.onmessage = onMessage;
    },
  };
}
