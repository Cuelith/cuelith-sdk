import { z } from "zod";
import { IdSchema, PluginIdSchema } from "./ids.js";
import { RoleIdSchema } from "./roles.js";
import { FeedSchema, ItemSchema, LAYER_IDS, ShowSchema, type Item } from "./show.js";

// Stato live (cap. 22): vive solo in memoria nel motore, mai nel file.

/**
 * Dove sono programma e anteprima: una voce della scaletta (`entryId`) oppure,
 * dal protocollo 1.5, un elemento mandato direttamente senza scaletta
 * (`itemId`, in `live.direct`). Mai tutti e due.
 */
export const CursorSchema = z
  .strictObject({
    entryId: IdSchema.optional(),
    itemId: IdSchema.optional(),
    slideIndex: z.number().int().nonnegative(),
  })
  .refine((c) => c.entryId === undefined || c.itemId === undefined, {
    message: "protocol.cursor.entryOrItem",
  });
export type Cursor = z.infer<typeof CursorSchema>;

export const LayerStateSchema = z.strictObject({
  visible: z.boolean(),
  itemId: IdSchema.optional(),
  slideIndex: z.number().int().nonnegative().optional(),
  /** Solo per il layer "message": testo mostrato al palco o al relatore. */
  text: z.string().optional(),
});
export type LayerState = z.infer<typeof LayerStateSchema>;

export const OutputLiveSchema = z.strictObject({
  blackout: z.boolean(),
  freeze: z.boolean(),
  override: FeedSchema.optional(),
  status: z.enum(["ok", "error"]),
  /** Chiave di traduzione dell'errore. */
  error: z.string().optional(),
  /**
   * Messaggio per chi guarda questa uscita (es. il relatore sul monitor del
   * palco: "5 minuti"), dal protocollo 1.7. Lo mostrano i look col layer "message".
   */
  message: z.string().max(500).optional(),
});
export type OutputLive = z.infer<typeof OutputLiveSchema>;

/**
 * Timer della regia (dal protocollo 1.7): conto alla rovescia condiviso da
 * tutte le postazioni e mostrato sui monitor del palco. In corsa conta da
 * `startedAt`; in pausa tiene i millisecondi rimasti. Sotto zero = tempo scaduto.
 */
export const TimerSchema = z.strictObject({
  durationMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000),
  /** Millisecondi rimasti quando e' fermo (o al momento della partenza). */
  remainingMs: z
    .number()
    .int()
    .min(-24 * 60 * 60 * 1000)
    .max(24 * 60 * 60 * 1000),
  /** Istante della partenza, se sta correndo. */
  startedAt: z.iso.datetime().optional(),
});
export type Timer = z.infer<typeof TimerSchema>;

/** Millisecondi rimasti adesso (negativi = oltre il tempo). */
export function timerRemaining(timer: Timer, now: number = Date.now()): number {
  if (timer.startedAt === undefined) return timer.remainingMs;
  return timer.remainingMs - (now - Date.parse(timer.startedAt));
}

/** Fase del timer per i colori: verde, ambra sotto i 2 minuti, rosso sotto i 30 secondi e oltre. */
export function timerPhase(remainingMs: number): "ok" | "warning" | "danger" {
  if (remainingMs <= 30_000) return "danger";
  if (remainingMs <= 120_000) return "warning";
  return "ok";
}

/** "12:40", "1:05:00", "-0:42" (oltre il tempo). */
export function formatTimer(remainingMs: number): string {
  const negative = remainingMs < 0;
  const total = Math.ceil(Math.abs(remainingMs) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const text =
    hours > 0
      ? `${String(hours)}:${pad(minutes)}:${pad(seconds)}`
      : `${String(minutes)}:${pad(seconds)}`;
  return negative && total > 0 ? `-${text}` : text;
}

export const CLIENT_KINDS = ["client", "renderer", "plugin"] as const;
export const ClientKindSchema = z.enum(CLIENT_KINDS);
export type ClientKind = z.infer<typeof ClientKindSchema>;

export const ClientInfoSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: ClientKindSchema,
  role: RoleIdSchema,
  /** Vero per la postazione sullo stesso computer del motore. */
  local: z.boolean(),
  connectedAt: z.iso.datetime(),
  /** Postazione abbinata in rete (dal protocollo 1.10): il suo id stabile, per revocarla. */
  pairedId: z.string().min(1).optional(),
});
export type ClientInfo = z.infer<typeof ClientInfoSchema>;

/**
 * Postazioni in rete locale (cap. 9 e 27, dal protocollo 1.10). Il motore
 * ascolta in rete solo se l'utente lo chiede, e solo sull'indirizzo scelto.
 */
export const NetworkStateSchema = z.strictObject({
  enabled: z.boolean(),
  /** Indirizzo IPv4 su cui il motore ascolta. */
  address: z.string().optional(),
  port: z.number().int().positive().optional(),
  /** Indirizzi da aprire nel browser delle altre postazioni. */
  urls: z.array(z.string()),
  /** Chiave di traduzione se l'ascolto non e' partito (porta occupata, rete sparita). */
  error: z.string().optional(),
});
export type NetworkState = z.infer<typeof NetworkStateSchema>;

/** Postazione abbinata: resta finche' non la si revoca. Il token non esce mai dal motore. */
export const PairedStationSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  role: RoleIdSchema,
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime().optional(),
});
export type PairedStation = z.infer<typeof PairedStationSchema>;

/** Ciclo di vita di un modulo nel motore (cap. 24). */
export const PLUGIN_STATES = [
  "discovered",
  "installed",
  "enabled",
  "activating",
  "active",
  "deactivating",
  "disabled",
  "crashed",
] as const;
export const PluginStateSchema = z.enum(PLUGIN_STATES);
export type PluginState = z.infer<typeof PluginStateSchema>;

export const PluginStatusSchema = z.strictObject({
  id: PluginIdSchema,
  version: z.string().min(1),
  state: PluginStateSchema,
  /** Chiave di traduzione dell'errore, se il modulo e' in crash o spento per errore. */
  error: z.string().optional(),
});
export type PluginStatus = z.infer<typeof PluginStatusSchema>;

export const LiveStateSchema = z.strictObject({
  /** Cresce a ogni patch. */
  rev: z.number().int().nonnegative(),
  cursor: CursorSchema,
  preview: CursorSchema,
  /**
   * Elementi mandati in anteprima o in onda senza passare dalla scaletta (dal
   * protocollo 1.5): copie tenute solo in memoria, mai salvate nello show. Il
   * motore toglie quelle che non sono piu' ne' in programma ne' in anteprima.
   */
  direct: z.record(IdSchema, ItemSchema).optional(),
  /** Timer della regia (dal protocollo 1.7), se impostato. */
  timer: TimerSchema.optional(),
  layers: z.strictObject(
    Object.fromEntries(LAYER_IDS.map((id) => [id, LayerStateSchema])) as Record<
      (typeof LAYER_IDS)[number],
      typeof LayerStateSchema
    >,
  ),
  outputs: z.record(IdSchema, OutputLiveSchema),
  /** outputId -> sceneId per le uscite con feed "scene". */
  activeScene: z.record(IdSchema, IdSchema),
  clients: z.array(ClientInfoSchema),
  plugins: z.array(PluginStatusSchema),
  /** Percorso del file aperto; assente per uno show mai salvato. */
  showPath: z.string().optional(),
  /** Vero se ci sono modifiche non ancora salvate su file. */
  dirty: z.boolean(),
  /**
   * Cresce a ogni modifica delle librerie (dal protocollo 1.2): le librerie
   * non viaggiano nello stato, le postazioni le rileggono quando cambia.
   */
  libraryRev: z.number().int().nonnegative(),
  /**
   * Copia automatica rimasta da una chiusura non corretta (arresto, blocco):
   * la postazione propone di riaprirla. Dal protocollo 1.1.
   */
  recovery: z
    .strictObject({ path: z.string().min(1), showName: z.string(), savedAt: z.iso.datetime() })
    .optional(),
  /** Postazioni in rete locale (dal protocollo 1.10); assente = solo questo computer. */
  network: NetworkStateSchema.optional(),
});
export type LiveState = z.infer<typeof LiveStateSchema>;

export function emptyLayers(): LiveState["layers"] {
  return Object.fromEntries(LAYER_IDS.map((id) => [id, { visible: false }])) as LiveState["layers"];
}

/**
 * Documento di stato che il motore distribuisce: istantanea con
 * state.subscribe, poi patch RFC 6902 con percorsi da questa radice
 * (es. "/live/cursor/slideIndex", "/show/items/<id>/title").
 */
export const StateDocumentSchema = z.strictObject({
  show: ShowSchema,
  live: LiveStateSchema,
});
export type StateDocument = z.infer<typeof StateDocumentSchema>;

/** Elemento con quell'id: dello show o fuori scaletta (`live.direct`). */
export function itemById(doc: StateDocument, id: string | undefined): Item | undefined {
  if (id === undefined) return undefined;
  return doc.show.items[id] ?? doc.live.direct?.[id];
}

/** Elemento a cui punta un cursore (programma o anteprima), se c'e'. */
export function cursorItem(doc: StateDocument, cursor: Cursor): Item | undefined {
  if (cursor.itemId !== undefined) return doc.live.direct?.[cursor.itemId];
  if (cursor.entryId === undefined) return undefined;
  const entry = doc.show.playlist.find((e) => e.id === cursor.entryId);
  return entry === undefined ? undefined : doc.show.items[entry.itemId];
}

/**
 * "In onda" (decisione 0004): il programma ha una slide e almeno un'uscita la
 * mostra (non in nero). In onda non si installano aggiornamenti e non si fa
 * nulla che possa interrompere le uscite.
 */
export function isOnAir(doc: StateDocument): boolean {
  const program = doc.live.cursor;
  if (program.entryId === undefined && program.itemId === undefined) return false;
  return Object.keys(doc.show.outputs).some((id) => {
    const live = doc.live.outputs[id];
    return live !== undefined && !live.blackout;
  });
}

/** Monitor collegati al computer del motore. */
export const DisplayInfoSchema = z.strictObject({
  id: z.string().min(1),
  /** Chiave o nome fornito dal sistema operativo. */
  label: z.string(),
  primary: z.boolean(),
  bounds: z.strictObject({
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  scaleFactor: z.number().positive(),
});
export type DisplayInfo = z.infer<typeof DisplayInfoSchema>;
