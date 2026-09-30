import { z } from "zod";
import { IdSchema, PluginIdSchema } from "./ids.js";
import { RoleIdSchema } from "./roles.js";
import { FeedSchema, LAYER_IDS, ShowSchema } from "./show.js";

// Stato live (cap. 22): vive solo in memoria nel motore, mai nel file.

export const CursorSchema = z.strictObject({
  entryId: IdSchema.optional(),
  slideIndex: z.number().int().nonnegative(),
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
});
export type OutputLive = z.infer<typeof OutputLiveSchema>;

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
});
export type ClientInfo = z.infer<typeof ClientInfoSchema>;

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
