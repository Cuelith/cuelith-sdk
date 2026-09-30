import { z } from "zod";
import { StateDocumentSchema } from "./live.js";
import { CatalogSchema, LangSchema } from "./locale.js";

const RpcErrorObjectSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z
    .object({
      params: z.record(z.string(), z.string()).optional(),
      issues: z.array(z.unknown()).optional(),
    })
    .optional(),
});

// Ponte tra la postazione e il pannello di un modulo (cap. 11 e 24). Il
// pannello gira in un iframe isolato (sandbox, senza rete): parla solo con la
// postazione, attraverso una MessagePort consegnata all'avvio. La postazione
// inoltra al motore solo i comandi consentiti al ruolo del modulo.

/** Messaggio con cui la postazione consegna la porta al pannello (via postMessage). */
export const PANEL_CONNECT = "cuelith:connect";

/** Comandi della postazione stessa, non del motore. */
export const PANEL_HOST_METHODS = {
  /** Avviso all'operatore: chiave di traduzione del modulo. */
  notify: "host.notify",
  /** Chiude il pannello (per i pannelli "center"). */
  close: "host.close",
  /** Apre un altro pannello dello stesso modulo, con un contesto (es. il canto da modificare). */
  openPanel: "host.openPanel",
  /** Fa salvare un file all'operatore (es. un canto esportato): la postazione chiede dove. */
  saveFile: "host.saveFile",
} as const;

export const OpenPanelParamsSchema = z.strictObject({
  panel: z.string().min(1),
  context: z.unknown().optional(),
});

export const SaveFileParamsSchema = z.strictObject({
  name: z.string().min(1).max(200),
  content: z.string().max(20 * 1024 * 1024),
  mime: z.string().min(1).max(100),
});

export const HostToPanelSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("init"),
    pluginId: z.string(),
    panelId: z.string(),
    lang: LangSchema,
    /** Testi del modulo (le sue chiavi) nella lingua attiva. */
    catalog: CatalogSchema,
    state: StateDocumentSchema,
    /** Cio' che un altro pannello del modulo ha passato aprendo questo. */
    context: z.unknown().optional(),
  }),
  z.strictObject({ type: z.literal("state"), state: StateDocumentSchema }),
  z.strictObject({ type: z.literal("catalog"), lang: LangSchema, catalog: CatalogSchema }),
  z.strictObject({ type: z.literal("result"), id: z.number().int(), result: z.unknown() }),
  z.strictObject({ type: z.literal("error"), id: z.number().int(), error: RpcErrorObjectSchema }),
]);
export type HostToPanel = z.infer<typeof HostToPanelSchema>;

export const PanelToHostSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("call"),
    id: z.number().int(),
    method: z.string().min(1),
    params: z.unknown().optional(),
  }),
]);
export type PanelToHost = z.infer<typeof PanelToHostSchema>;
