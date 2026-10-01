import { z } from "zod";
import { IdSchema, PluginIdSchema, ProviderSchema, QualifiedTypeSchema } from "./ids.js";
import {
  ClientKindSchema,
  DisplayInfoSchema,
  PluginStatusSchema,
  StateDocumentSchema,
} from "./live.js";
import { CatalogSchema, LangSchema } from "./locale.js";
import { PermissionSchema, PluginManifestSchema } from "./plugin.js";
import { RegistryPluginSchema } from "./registry.js";
import { RoleIdSchema, type Scope } from "./roles.js";
import {
  AttachmentSchema,
  AudienceSchema,
  CreditsSchema,
  ItemSchema,
  MediaInfoSchema,
  TagSchema,
  FeedSchema,
  FieldSchema,
  LayerIdSchema,
  MediaRefSchema,
  OutputFormatSchema,
  OutputKindSchema,
  SceneElementSchema,
} from "./show.js";

// Ogni metodo del protocollo e' dichiarato una volta sola qui: nome, ambito
// (per i ruoli), parametri e risultato. Motore, postazione e SDK usano
// questo stesso elenco (cap. 18: una modifica al protocollo aggiorna tutti).

interface MethodSpec<P extends z.ZodType = z.ZodType, R extends z.ZodType = z.ZodType> {
  readonly scope: Scope;
  readonly params: P;
  readonly result: R;
}

const spec = <P extends z.ZodType, R extends z.ZodType>(
  scope: Scope,
  params: P,
  result: R,
): MethodSpec<P, R> => ({
  scope,
  params,
  result,
});

const Empty = z.strictObject({});
const Rev = z.strictObject({ rev: z.number().int().nonnegative() });
const Created = z.strictObject({ id: IdSchema, rev: z.number().int().nonnegative() });
const Index = z.number().int().nonnegative();
const Params = z.record(z.string(), z.unknown());

/**
 * Una slide da mandare in anteprima o in onda: di una voce della scaletta
 * oppure (dal protocollo 1.5) di un elemento fuori scaletta in `live.direct`.
 */
export const PositionSchema = z.union([
  z.strictObject({ entryId: IdSchema, slideIndex: Index }),
  z.strictObject({ itemId: IdSchema, slideIndex: Index }),
]);
export type Position = z.infer<typeof PositionSchema>;

export const SlideInputSchema = z.strictObject({
  fields: z.record(z.string().min(1), FieldSchema),
  group: z.string().min(1).optional(),
  media: MediaRefSchema.optional(),
  background: MediaRefSchema.optional(),
});
export type SlideInput = z.infer<typeof SlideInputSchema>;

export const TransitionSchema = z.strictObject({
  type: z.enum(["cut", "fade"]),
  durationMs: z.number().int().min(0).max(10_000),
});
export type Transition = z.infer<typeof TransitionSchema>;

const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** Una libreria: elenco ordinato di elementi dell'archivio (decisione 0001). */
/** Sigla di una libreria (es. "INN"): lettere e cifre maiuscole, per "INN 245" (protocollo 1.3). */
export const LibraryCodeSchema = z
  .string()
  .regex(/^[A-Z0-9]{1,8}$/, "protocol.library.codeInvalid");

/** Categoria di una libreria (es. "Innari", "Letture"), scelta dall'utente (protocollo 1.3). */
export const LibraryCategorySchema = z.string().trim().min(1).max(40);

export const LibrarySchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  color: HexColor.optional(),
  category: LibraryCategorySchema.optional(),
  code: LibraryCodeSchema.optional(),
  favorite: z.boolean(),
  count: z.number().int().nonnegative(),
});
export type Library = z.infer<typeof LibrarySchema>;

/** Dove sta un elemento: libreria, sigla e numero (per la ricerca in tutto l'archivio). */
export const LibraryMembershipSchema = z.strictObject({
  libraryId: IdSchema,
  name: z.string(),
  code: LibraryCodeSchema.optional(),
  number: z.string().optional(),
});
export type LibraryMembership = z.infer<typeof LibraryMembershipSchema>;

/** Riga di un elenco di libreria: quanto basta per mostrarla e cercarla. */
export const LibraryItemSummarySchema = z.strictObject({
  id: IdSchema,
  type: QualifiedTypeSchema,
  title: z.string(),
  authors: z.array(z.string()),
  tags: z.array(z.string()),
  slideCount: z.number().int().nonnegative(),
  hasAttachments: z.boolean(),
  updatedAt: z.iso.datetime(),
  derivedFrom: IdSchema.optional(),
  /** Solo negli elenchi di una libreria: la voce e il suo numero (es. innario). */
  entryId: IdSchema.optional(),
  number: z.string().optional(),
  /** Librerie che contengono l'elemento, con sigla e numero (protocollo 1.3). */
  libraries: z.array(LibraryMembershipSchema),
});
export type LibraryItemSummary = z.infer<typeof LibraryItemSummarySchema>;

const EntryNumber = z.string().trim().min(1).max(20);

export const InstalledPluginSchema = z.strictObject({
  manifest: PluginManifestSchema,
  status: PluginStatusSchema,
  /** Installato insieme al nucleo (es. la lingua italiana). */
  bundled: z.boolean(),
  /** Vero se non si puo' disattivare, es. l'unica lingua installata. */
  required: z.boolean(),
  /** Attivato dall'utente (un modulo disattivato resta installato). Dal protocollo 1.4. */
  enabled: z.boolean(),
  /** Da dove viene: col nucleo, dal marketplace o da un file/cartella locale. */
  source: z.enum(["bundled", "registry", "local"]),
});
export type InstalledPlugin = z.infer<typeof InstalledPluginSchema>;

/** Metodi del motore, chiamabili da postazioni e moduli secondo il ruolo. */
export const EngineMethods = {
  // ---- sessione ----
  "session.hello": spec(
    "session",
    z.strictObject({
      protocol: z.string().min(1),
      client: z.strictObject({ name: z.string().min(1), kind: ClientKindSchema }),
    }),
    z.strictObject({
      protocol: z.string(),
      engine: z.strictObject({ version: z.string() }),
      sessionId: z.string(),
    }),
  ),
  "session.pair": spec(
    "session",
    z.strictObject({
      code: z.string().regex(/^\d{6}$/, "protocol.pair.codeInvalid"),
      name: z.string().min(1),
    }),
    z.strictObject({ token: z.string().min(32), clientId: z.string(), role: RoleIdSchema }),
  ),
  "session.auth": spec(
    "session",
    z.strictObject({ token: z.string().min(32) }),
    z.strictObject({ clientId: z.string(), role: RoleIdSchema }),
  ),
  "pairing.start": spec(
    "admin",
    z.strictObject({ role: RoleIdSchema }),
    z.strictObject({ code: z.string().regex(/^\d{6}$/), expiresAt: z.iso.datetime() }),
  ),
  "session.revoke": spec("admin", z.strictObject({ clientId: z.string().min(1) }), Empty),

  // ---- lettura ----
  "state.subscribe": spec(
    "read",
    Empty,
    z.strictObject({ rev: z.number().int().nonnegative(), state: StateDocumentSchema }),
  ),
  "display.list": spec("read", Empty, z.strictObject({ displays: z.array(DisplayInfoSchema) })),
  "locale.list": spec(
    "read",
    Empty,
    z.strictObject({
      langs: z.array(z.strictObject({ lang: LangSchema, name: z.string() })),
      active: LangSchema,
    }),
  ),
  "locale.catalog": spec(
    "read",
    z.strictObject({ lang: LangSchema }),
    z.strictObject({ catalog: CatalogSchema }),
  ),
  "plugin.list": spec("read", Empty, z.strictObject({ plugins: z.array(InstalledPluginSchema) })),

  // ---- regia della presentazione ----
  "cue.next": spec("cue", Empty, Rev),
  "cue.prev": spec("cue", Empty, Rev),
  "cue.goto": spec("cue", PositionSchema, Rev),
  /** Manda in programma cio' che e' in anteprima. */
  "cue.take": spec("cue", Empty, Rev),
  "preview.set": spec("cue", PositionSchema, Rev),
  /**
   * Manda un elemento della libreria in anteprima o subito in onda senza
   * metterlo in scaletta (dal protocollo 1.5). Restituisce l'id della copia in
   * `live.direct`, da usare con cue.goto / preview.set.
   */
  "cue.send": spec(
    "cue",
    z.strictObject({
      libraryItemId: IdSchema,
      to: z.enum(["preview", "program"]),
      slideIndex: Index.optional(),
    }),
    Created,
  ),
  "layer.clear": spec("cue", z.strictObject({ layer: LayerIdSchema }), Rev),
  /** Messaggio su un'uscita (es. al relatore sul palco); testo vuoto = lo toglie. */
  "message.send": spec(
    "cue",
    z.strictObject({ outputId: IdSchema, text: z.string().max(500) }),
    Rev,
  ),
  /** Timer della regia (dal protocollo 1.7): durata, partenza, pausa, azzeramento. */
  "timer.set": spec(
    "cue",
    z.strictObject({
      durationMs: z
        .number()
        .int()
        .min(0)
        .max(24 * 60 * 60 * 1000),
    }),
    Rev,
  ),
  "timer.start": spec("cue", Empty, Rev),
  "timer.pause": spec("cue", Empty, Rev),
  "timer.reset": spec("cue", Empty, Rev),
  "timer.clear": spec("cue", Empty, Rev),

  // ---- comandi delle uscite ----
  "output.setFeed": spec(
    "output.control",
    z.strictObject({ outputId: IdSchema, feed: FeedSchema }),
    Rev,
  ),
  "output.blackout": spec(
    "output.control",
    z.strictObject({ outputId: IdSchema, on: z.boolean() }),
    Rev,
  ),
  "output.freeze": spec(
    "output.control",
    z.strictObject({ outputId: IdSchema, on: z.boolean() }),
    Rev,
  ),
  "scene.activate": spec(
    "output.control",
    z.strictObject({
      outputId: IdSchema,
      sceneId: IdSchema,
      transition: TransitionSchema.optional(),
    }),
    Rev,
  ),

  // ---- configurazione delle uscite ----
  "output.create": spec(
    "output.config",
    z.strictObject({
      name: z.string().min(1),
      kind: OutputKindSchema,
      provider: ProviderSchema,
      target: Params,
      format: OutputFormatSchema,
      feed: FeedSchema,
      owner: RoleIdSchema.optional(),
    }),
    Created,
  ),
  "output.update": spec(
    "output.config",
    z.strictObject({
      id: IdSchema,
      name: z.string().min(1).optional(),
      target: Params.optional(),
      format: OutputFormatSchema.optional(),
      feed: FeedSchema.optional(),
      owner: RoleIdSchema.nullable().optional(),
    }),
    Rev,
  ),
  "output.delete": spec("output.config", z.strictObject({ id: IdSchema }), Rev),

  // ---- modifica dello show ----
  "item.create": spec(
    "edit",
    z.strictObject({
      type: QualifiedTypeSchema,
      title: z.string(),
      slides: z.array(SlideInputSchema).optional(),
      meta: Params.optional(),
      credits: CreditsSchema.optional(),
      tags: z.array(TagSchema).optional(),
      attachments: z.array(AttachmentSchema).optional(),
    }),
    Created,
  ),
  "item.update": spec(
    "edit",
    z.strictObject({
      id: IdSchema,
      title: z.string().optional(),
      arrangement: z.array(z.string().min(1)).nullable().optional(),
      meta: Params.optional(),
      credits: CreditsSchema.nullable().optional(),
      tags: z.array(TagSchema).optional(),
      attachments: z.array(AttachmentSchema).optional(),
    }),
    Rev,
  ),
  "item.delete": spec("edit", z.strictObject({ id: IdSchema }), Rev),
  "slide.insert": spec(
    "edit",
    z.strictObject({ itemId: IdSchema, index: Index.optional(), slide: SlideInputSchema }),
    Created,
  ),
  "slide.update": spec(
    "edit",
    z.strictObject({
      itemId: IdSchema,
      slideId: IdSchema,
      fields: z.record(z.string().min(1), FieldSchema).optional(),
      group: z.string().min(1).nullable().optional(),
      media: MediaRefSchema.nullable().optional(),
      background: MediaRefSchema.nullable().optional(),
    }),
    Rev,
  ),
  "slide.delete": spec("edit", z.strictObject({ itemId: IdSchema, slideId: IdSchema }), Rev),
  "slide.move": spec(
    "edit",
    z.strictObject({ itemId: IdSchema, slideId: IdSchema, toIndex: Index }),
    Rev,
  ),
  "playlist.add": spec(
    "edit",
    z.strictObject({
      itemId: IdSchema,
      index: Index.optional(),
      audience: AudienceSchema.optional(),
    }),
    Created,
  ),
  /** Mette in scaletta una copia di un elemento di libreria (dal protocollo 1.2). */
  "playlist.addFromLibrary": spec(
    "edit",
    z.strictObject({ itemId: IdSchema, index: Index.optional() }),
    Created,
  ),
  /** Sostituisce la copia nello show con la versione attuale della libreria. */
  "item.refreshFromLibrary": spec("edit", z.strictObject({ id: IdSchema }), Rev),
  "playlist.remove": spec("edit", z.strictObject({ entryId: IdSchema }), Rev),
  "playlist.move": spec("edit", z.strictObject({ entryId: IdSchema, toIndex: Index }), Rev),
  "playlist.setAudience": spec(
    "edit",
    z.strictObject({ entryId: IdSchema, audience: AudienceSchema.nullable() }),
    Rev,
  ),
  "look.create": spec(
    "edit",
    z.strictObject({
      name: z.string().min(1),
      sourceType: QualifiedTypeSchema,
      fields: z.array(z.string().min(1)),
      layers: z.array(LayerIdSchema),
      template: QualifiedTypeSchema,
      style: Params,
    }),
    Created,
  ),
  "look.update": spec(
    "edit",
    z.strictObject({
      id: IdSchema,
      name: z.string().min(1).optional(),
      fields: z.array(z.string().min(1)).optional(),
      layers: z.array(LayerIdSchema).optional(),
      template: QualifiedTypeSchema.optional(),
      style: Params.optional(),
    }),
    Rev,
  ),
  "look.delete": spec("edit", z.strictObject({ id: IdSchema }), Rev),
  "scene.create": spec(
    "edit",
    z.strictObject({ name: z.string().min(1), elements: z.array(SceneElementSchema).optional() }),
    Created,
  ),
  "scene.update": spec(
    "edit",
    z.strictObject({
      id: IdSchema,
      name: z.string().min(1).optional(),
      elements: z.array(SceneElementSchema).optional(),
    }),
    Rev,
  ),
  "scene.delete": spec("edit", z.strictObject({ id: IdSchema }), Rev),

  // ---- file dello show ----
  "show.new": spec("show", z.strictObject({ name: z.string().min(1) }), Rev),
  "show.open": spec("show", z.strictObject({ path: z.string().min(1) }), Rev),
  "show.save": spec(
    "show",
    z.strictObject({ path: z.string().min(1).optional() }),
    z.strictObject({ path: z.string(), rev: z.number().int().nonnegative() }),
  ),
  "show.rename": spec("show", z.strictObject({ name: z.string().min(1) }), Rev),
  /** Elimina la copia automatica proposta in live.recovery (dal protocollo 1.1). */
  "show.discardRecovery": spec("show", Empty, Rev),

  // ---- librerie e archivio media (dal protocollo 1.2) ----
  "library.list": spec("read", Empty, z.strictObject({ libraries: z.array(LibrarySchema) })),
  "library.create": spec(
    "library",
    z.strictObject({
      name: z.string().trim().min(1),
      description: z.string().optional(),
      color: HexColor.optional(),
      category: LibraryCategorySchema.optional(),
      code: LibraryCodeSchema.optional(),
    }),
    Created,
  ),
  "library.update": spec(
    "library",
    z.strictObject({
      id: IdSchema,
      name: z.string().trim().min(1).optional(),
      description: z.string().nullable().optional(),
      color: HexColor.nullable().optional(),
      category: LibraryCategorySchema.nullable().optional(),
      code: LibraryCodeSchema.nullable().optional(),
      favorite: z.boolean().optional(),
    }),
    Rev,
  ),
  /** Elimina la libreria, non i suoi elementi: restano nell'archivio. */
  "library.delete": spec("library", z.strictObject({ id: IdSchema }), Rev),
  "library.move": spec("library", z.strictObject({ id: IdSchema, toIndex: Index }), Rev),
  /** Elementi di una libreria (o di tutto l'archivio), con ricerca e filtro per tag. */
  "library.items": spec(
    "read",
    z.strictObject({
      libraryId: IdSchema.optional(),
      query: z.string().max(200).optional(),
      tag: TagSchema.optional(),
      /** Solo elementi di questo tipo, es. i canti di un modulo (dal protocollo 1.4). */
      type: QualifiedTypeSchema.optional(),
      offset: Index.optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
    z.strictObject({
      items: z.array(LibraryItemSummarySchema),
      total: z.number().int().nonnegative(),
    }),
  ),
  "library.tags": spec(
    "read",
    Empty,
    z.strictObject({
      tags: z.array(z.strictObject({ tag: z.string(), count: z.number().int().positive() })),
    }),
  ),
  "library.getItem": spec(
    "read",
    z.strictObject({ id: IdSchema }),
    z.strictObject({ item: ItemSchema, updatedAt: z.iso.datetime() }),
  ),
  /** Crea o sostituisce un elemento dell'archivio; se nuovo lo aggiunge alla libreria indicata. */
  "library.saveItem": spec(
    "library",
    z.strictObject({ item: ItemSchema, libraryId: IdSchema.optional() }),
    Created,
  ),
  /** Nuova versione indipendente di un elemento, che ricorda l'originale. */
  "library.duplicateItem": spec(
    "library",
    z.strictObject({ id: IdSchema, libraryId: IdSchema.optional() }),
    Created,
  ),
  /** Toglie l'elemento dall'archivio e da tutte le librerie. */
  "library.deleteItem": spec("library", z.strictObject({ id: IdSchema }), Rev),
  /** Salva nell'archivio un elemento dello show (e ne fa la copia di riferimento). */
  "library.saveFromShow": spec(
    "library",
    z.strictObject({ itemId: IdSchema, libraryId: IdSchema.optional() }),
    Created,
  ),
  "library.addEntry": spec(
    "library",
    z.strictObject({
      libraryId: IdSchema,
      itemId: IdSchema,
      index: Index.optional(),
      number: EntryNumber.optional(),
    }),
    Created,
  ),
  "library.updateEntry": spec(
    "library",
    z.strictObject({ entryId: IdSchema, number: EntryNumber.nullable() }),
    Rev,
  ),
  "library.removeEntry": spec("library", z.strictObject({ entryId: IdSchema }), Rev),
  "library.moveEntry": spec("library", z.strictObject({ entryId: IdSchema, toIndex: Index }), Rev),
  /** Copia nell'archivio un file del computer del motore (basi musicali, immagini). */
  "media.import": spec(
    "library",
    z.strictObject({ path: z.string().min(1) }),
    z.strictObject({ media: MediaInfoSchema }),
  ),

  // ---- moduli ----
  "plugin.install": spec(
    "plugins",
    z.strictObject({ path: z.string().min(1) }),
    z.strictObject({ id: PluginIdSchema, version: z.string() }),
  ),
  /** Indice del marketplace (dal protocollo 1.4); se offline, l'ultima copia salvata. */
  "registry.list": spec(
    "read",
    z.strictObject({ refresh: z.boolean().optional() }),
    z.strictObject({
      plugins: z.array(RegistryPluginSchema),
      source: z.enum(["network", "cache", "none"]),
      fetchedAt: z.iso.datetime().optional(),
    }),
  ),
  /** Scarica dal marketplace, verifica l'impronta e installa (o aggiorna). */
  "plugin.installFromRegistry": spec(
    "plugins",
    z.strictObject({ id: PluginIdSchema, version: z.string().min(1).optional() }),
    z.strictObject({ id: PluginIdSchema, version: z.string() }),
  ),
  "plugin.uninstall": spec("plugins", z.strictObject({ pluginId: PluginIdSchema }), Empty),
  "plugin.enable": spec("plugins", z.strictObject({ pluginId: PluginIdSchema }), Empty),
  "plugin.disable": spec("plugins", z.strictObject({ pluginId: PluginIdSchema }), Empty),
  "plugin.command": spec(
    "plugin.command",
    z.strictObject({
      pluginId: PluginIdSchema,
      command: z.string().min(1),
      params: Params.optional(),
    }),
    z.strictObject({ result: z.unknown() }),
  ),

  // ---- solo per i processi dei moduli ----
  "storage.get": spec(
    "plugin.self",
    z.strictObject({ key: z.string().min(1) }),
    z.strictObject({ found: z.boolean(), value: z.unknown().optional() }),
  ),
  "storage.set": spec(
    "plugin.self",
    z.strictObject({ key: z.string().min(1), value: z.unknown() }),
    Empty,
  ),
  "storage.delete": spec("plugin.self", z.strictObject({ key: z.string().min(1) }), Empty),
  "events.subscribe": spec(
    "plugin.self",
    z.strictObject({ names: z.array(z.string().min(1)) }),
    Empty,
  ),
} as const satisfies Record<string, MethodSpec>;

export type EngineMethodName = keyof typeof EngineMethods;
export type EngineMethodParams<N extends EngineMethodName> = z.input<
  (typeof EngineMethods)[N]["params"]
>;
export type EngineMethodResult<N extends EngineMethodName> = z.output<
  (typeof EngineMethods)[N]["result"]
>;

export function isEngineMethod(name: string): name is EngineMethodName {
  return Object.hasOwn(EngineMethods, name);
}

/**
 * Richieste che il motore fa al processo di un modulo (righe JSON su stdio,
 * cap. 21 e 24). Il modulo risponde entro 5 secondi, altrimenti e'
 * considerato bloccato: il motore lo termina e lo riavvia (al massimo 3 volte
 * in 60 secondi).
 */
export const PluginHostMethods = {
  "plugin.activate": spec(
    "plugin.self",
    z.strictObject({
      context: z.strictObject({
        pluginId: PluginIdSchema,
        version: z.string(),
        protocol: z.string(),
        lang: LangSchema,
        settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
        /** Permessi approvati dall'utente (dal protocollo 1.8). */
        permissions: z.array(PermissionSchema),
        /**
         * Cartella privata del modulo, sempre leggibile e scrivibile (dal
         * protocollo 1.8): file grandi, cache. Sopravvive agli aggiornamenti.
         */
        dataDir: z.string().min(1),
      }),
    }),
    Empty,
  ),
  "plugin.deactivate": spec("plugin.self", Empty, Empty),
  /** Il motore controlla ogni tanto che il modulo risponda (dal protocollo 1.8). */
  "plugin.ping": spec("plugin.self", Empty, Empty),
  "command.execute": spec(
    "plugin.self",
    z.strictObject({ command: z.string().min(1), params: Params.optional() }),
    z.strictObject({ result: z.unknown() }),
  ),
} as const satisfies Record<string, MethodSpec>;

export type PluginHostMethodName = keyof typeof PluginHostMethods;
export type PluginHostMethodParams<N extends PluginHostMethodName> = z.input<
  (typeof PluginHostMethods)[N]["params"]
>;
export type PluginHostMethodResult<N extends PluginHostMethodName> = z.output<
  (typeof PluginHostMethods)[N]["result"]
>;

// ---- notifiche ----

export const JsonPatchOperationSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("add"), path: z.string(), value: z.unknown() }),
  z.strictObject({ op: z.literal("remove"), path: z.string() }),
  z.strictObject({ op: z.literal("replace"), path: z.string(), value: z.unknown() }),
  z.strictObject({ op: z.literal("move"), path: z.string(), from: z.string() }),
  z.strictObject({ op: z.literal("copy"), path: z.string(), from: z.string() }),
  z.strictObject({ op: z.literal("test"), path: z.string(), value: z.unknown() }),
]);
export type JsonPatchOperation = z.infer<typeof JsonPatchOperationSchema>;

export const Notifications = {
  /** Motore -> postazioni/renderer/moduli: patch allo StateDocument. */
  "state.patch": z.strictObject({
    rev: z.number().int().positive(),
    ops: z.array(JsonPatchOperationSchema),
  }),
  /** Motore -> iscritti: evento del nucleo o di un modulo. */
  event: z.strictObject({ name: z.string().min(1), payload: z.unknown().optional() }),
  /** Modulo -> motore: evento dichiarato in contributes.events (id locale). */
  "event.emit": z.strictObject({ name: z.string().min(1), payload: z.unknown().optional() }),
  /** Modulo -> motore: riga di log. */
  log: z.strictObject({ level: z.enum(["debug", "info", "warn", "error"]), message: z.string() }),
} as const;
export type NotificationName = keyof typeof Notifications;

/** Eventi emessi dal nucleo, usabili dalle regole e dai moduli. */
export const CORE_EVENTS = [
  "core.cue.changed",
  "core.preview.changed",
  "core.layer.cleared",
  "core.output.blackout",
  "core.output.freeze",
  "core.output.error",
  "core.show.opened",
  "core.show.saved",
  "core.plugin.stateChanged",
] as const;
export type CoreEvent = (typeof CORE_EVENTS)[number];
