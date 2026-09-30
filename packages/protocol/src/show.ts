import { validRange } from "semver";
import { z } from "zod";
import {
  IdSchema,
  PluginIdSchema,
  ProviderSchema,
  QualifiedTypeSchema,
  providerOf,
} from "./ids.js";
import { RoleIdSchema } from "./roles.js";

// Modello dati dello show (documento di progetto, cap. 22). Lo show e' il
// file .cuelith: JSON con "schema": 1. Lo stato live non entra mai nel file.

export const SHOW_SCHEMA_VERSION = 1;
export const SHOW_FILE_EXTENSION = ".cuelith";

const IdRecord = <V extends z.ZodType>(value: V) => z.record(IdSchema, value);
const Params = z.record(z.string(), z.unknown());
const Unit = z.number().min(0).max(1);

// ---------- Contenuto ----------

export const FIELD_KINDS = ["text", "chords", "notes", "reference"] as const;

export const FieldSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("text"), value: z.string() }),
  /** Formato ChordPro. */
  z.strictObject({ kind: z.literal("chords"), value: z.string() }),
  z.strictObject({ kind: z.literal("notes"), value: z.string() }),
  z.strictObject({ kind: z.literal("reference"), value: z.string() }),
]);
export type Field = z.infer<typeof FieldSchema>;

export const MediaRefSchema = z.strictObject({
  uri: z.string().min(1),
  kind: z.enum(["image", "video", "audio"]),
});
export type MediaRef = z.infer<typeof MediaRefSchema>;

// ---------- Archivio media, crediti, tag (protocollo 1.2, decisione 0001) ----------

export const MEDIA_KINDS = ["image", "audio", "video"] as const;
export const MediaKindSchema = z.enum(MEDIA_KINDS);
export type MediaKind = z.infer<typeof MediaKindSchema>;

/** File dell'archivio media: impronta SHA-256 del contenuto + estensione. */
export const MediaIdSchema = z
  .string()
  .regex(/^[a-f0-9]{64}\.[a-z0-9]{1,5}$/, "protocol.media.idInvalid");
export type MediaId = z.infer<typeof MediaIdSchema>;

/** Un MediaRef.uri che punta all'archivio: "media:<id>". */
export const MEDIA_URI_PREFIX = "media:";
export const mediaUri = (id: MediaId): string => MEDIA_URI_PREFIX + id;
export function mediaIdOf(uri: string): MediaId | undefined {
  if (!uri.startsWith(MEDIA_URI_PREFIX)) return undefined;
  const id = MediaIdSchema.safeParse(uri.slice(MEDIA_URI_PREFIX.length));
  return id.success ? id.data : undefined;
}

export const MediaInfoSchema = z.strictObject({
  id: MediaIdSchema,
  /** Nome originale del file, per mostrarlo all'operatore. */
  name: z.string().min(1),
  kind: MediaKindSchema,
  mime: z.string().min(1),
  size: z.number().int().nonnegative(),
});
export type MediaInfo = z.infer<typeof MediaInfoSchema>;

export const ATTACHMENT_ROLES = ["backing", "guide", "click", "other"] as const;
/** File allegato a un elemento, es. la base musicale di un canto. */
export const AttachmentSchema = z.strictObject({
  mediaId: MediaIdSchema,
  name: z.string().min(1),
  kind: MediaKindSchema,
  role: z.enum(ATTACHMENT_ROLES),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const AUTHOR_ROLES = ["artist", "words", "music", "translation", "arrangement"] as const;
export const AuthorSchema = z.strictObject({
  name: z.string().trim().min(1),
  role: z.enum(AUTHOR_ROLES),
});
export type Author = z.infer<typeof AuthorSchema>;

/** Crediti e copyright di un elemento (qualsiasi tipo: testo, canto, immagine...). */
export const CreditsSchema = z.strictObject({
  authors: z.array(AuthorSchema),
  altTitles: z.array(z.string().trim().min(1)).optional(),
  copyright: z.string().optional(),
  publisher: z.string().optional(),
  year: z.number().int().min(1000).max(9999).optional(),
  /** Numero del brano nel catalogo CCLI (solo cifre). */
  ccli: z
    .string()
    .regex(/^\d{1,10}$/, "protocol.credits.ccliInvalid")
    .optional(),
  license: z.string().optional(),
  /** Dove le uscite mostrano i crediti. */
  show: z.enum(["none", "first", "last"]),
});
export type Credits = z.infer<typeof CreditsSchema>;

export const TagSchema = z.string().trim().min(1).max(40);

/** Un elemento dello show copiato da una libreria: da dove viene e di quando e' la copia. */
export const LibraryRefSchema = z.strictObject({
  itemId: IdSchema,
  updatedAt: z.iso.datetime(),
});
export type LibraryRef = z.infer<typeof LibraryRefSchema>;

export const SlideSchema = z.strictObject({
  id: IdSchema,
  group: z.string().min(1).optional(),
  /** Chiavi standard: text, chords, notes, reference. */
  fields: z.record(z.string().min(1), FieldSchema),
  media: MediaRefSchema.optional(),
  background: MediaRefSchema.optional(),
});
export type Slide = z.infer<typeof SlideSchema>;

export const ItemSchema = z.strictObject({
  id: IdSchema,
  /** "core.text" | "core.media" | "cuelith.bible.passage" ... */
  type: QualifiedTypeSchema,
  title: z.string(),
  slides: z.array(SlideSchema),
  /** Ordine dei gruppi, es. ["S1","RIT","S2","RIT"]. */
  arrangement: z.array(z.string().min(1)).optional(),
  meta: Params,
  credits: CreditsSchema.optional(),
  tags: z.array(TagSchema).optional(),
  attachments: z.array(AttachmentSchema).optional(),
  /** Versione di un altro elemento (es. un arrangiamento diverso dello stesso canto). */
  derivedFrom: IdSchema.optional(),
  /** Solo negli show: l'elemento di libreria da cui e' stato copiato. */
  libraryRef: LibraryRefSchema.optional(),
});
export type Item = z.infer<typeof ItemSchema>;

/**
 * Slide nell'ordine in cui si proiettano: l'arrangiamento se c'e' (un gruppo
 * puo' ripetersi, es. il ritornello), altrimenti l'ordine delle slide. Gli
 * indici di slide dello stato live (cursore, anteprima, layer) si riferiscono
 * a questa sequenza.
 */
export function slideSequence(item: Pick<Item, "slides" | "arrangement">): Slide[] {
  if (item.arrangement === undefined) return item.slides;
  return item.arrangement.flatMap((group) => item.slides.filter((s) => s.group === group));
}

export const AudienceSchema = z.enum(["all", "room", "stream"]);
export type Audience = z.infer<typeof AudienceSchema>;

export const PlaylistEntrySchema = z.strictObject({
  id: IdSchema,
  itemId: IdSchema,
  audience: AudienceSchema.optional(),
});
export type PlaylistEntry = z.infer<typeof PlaylistEntrySchema>;

// ---------- Immagine ----------

export const SourceSchema = z.strictObject({
  id: IdSchema,
  /** "core.presentation" | "core.media" | "core.image" | "cuelith.capture.device" ... */
  type: QualifiedTypeSchema,
  provider: ProviderSchema,
  params: Params,
});
export type Source = z.infer<typeof SourceSchema>;

export const LAYER_IDS = ["background", "content", "lowerThird", "message", "logo"] as const;
export const LayerIdSchema = z.enum(LAYER_IDS);
export type LayerId = z.infer<typeof LayerIdSchema>;

export const LookSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  /** A quale tipo di sorgente si applica. */
  sourceType: QualifiedTypeSchema,
  /** Campi visibili, es. ["text","chords"]. */
  fields: z.array(z.string().min(1)),
  /** Layer visibili, es. senza "background" per il palco. */
  layers: z.array(LayerIdSchema),
  /** "core.fullscreen" | "core.lowerThird" | "core.stage" | modulo. */
  template: QualifiedTypeSchema,
  /** Font, colori, margini, allineamento, transizione: li interpreta il template. */
  style: Params,
});
export type Look = z.infer<typeof LookSchema>;

export const RectSchema = z.strictObject({ x: Unit, y: Unit, w: Unit, h: Unit });
export const CropSchema = z.strictObject({ t: Unit, r: Unit, b: Unit, l: Unit });

export const SceneElementSchema = z.strictObject({
  id: IdSchema,
  sourceId: IdSchema,
  lookId: IdSchema.optional(),
  rect: RectSchema,
  crop: CropSchema.optional(),
  opacity: Unit,
  z: z.number().int(),
  visible: z.boolean(),
});
export type SceneElement = z.infer<typeof SceneElementSchema>;

export const SceneSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  elements: z.array(SceneElementSchema),
});
export type Scene = z.infer<typeof SceneSchema>;

// ---------- Uscite ----------

export const FeedSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("scene"), sceneId: IdSchema }),
  z.strictObject({ type: z.literal("source"), sourceId: IdSchema, lookId: IdSchema.optional() }),
  z.strictObject({ type: z.literal("mirror"), outputId: IdSchema }),
]);
export type Feed = z.infer<typeof FeedSchema>;

export const OUTPUT_KINDS = ["display", "ndi", "stream", "record", "virtual"] as const;
export const OutputKindSchema = z.enum(OUTPUT_KINDS);
export type OutputKind = z.infer<typeof OutputKindSchema>;

/** Destinazione di un'uscita "display" del nucleo. */
export const DisplayTargetSchema = z.strictObject({
  /** Id del monitor come lo riporta display.list. */
  displayId: z.string().min(1),
  /** "fullscreen" = tutto il monitor; "window" = finestra normale (prove, un solo monitor). */
  mode: z.enum(["fullscreen", "window"]),
});
export type DisplayTarget = z.infer<typeof DisplayTargetSchema>;

export const OutputFormatSchema = z.strictObject({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
});
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

export const OutputConfigSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  kind: OutputKindSchema,
  /** display = core, gli altri = moduli. */
  provider: ProviderSchema,
  /** Es. { displayId } oppure { url, key }. I segreti non stanno qui ma nel portachiavi. */
  target: Params,
  format: OutputFormatSchema,
  feed: FeedSchema,
  owner: RoleIdSchema.optional(),
});
export type OutputConfig = z.infer<typeof OutputConfigSchema>;

// ---------- Automazione ----------

export const CommandSchema = z.strictObject({
  method: z.string().min(1),
  params: Params.optional(),
});
export type Command = z.infer<typeof CommandSchema>;

export const RuleSchema = z.strictObject({
  id: IdSchema,
  enabled: z.boolean(),
  when: z.strictObject({ event: z.string().min(1), match: Params.optional() }),
  then: z.array(CommandSchema),
});
export type Rule = z.infer<typeof RuleSchema>;

// ---------- Show ----------

export const SemverRangeSchema = z
  .string()
  .refine((r) => validRange(r) !== null, "protocol.semverRange.invalid");

const ShowShape = z.strictObject({
  schema: z.literal(SHOW_SCHEMA_VERSION),
  id: IdSchema,
  name: z.string().min(1),
  playlist: z.array(PlaylistEntrySchema),
  items: IdRecord(ItemSchema),
  sources: IdRecord(SourceSchema),
  looks: IdRecord(LookSchema),
  scenes: IdRecord(SceneSchema),
  outputs: IdRecord(OutputConfigSchema),
  rules: z.array(RuleSchema),
  /** Moduli richiesti e intervallo di versioni compatibile. */
  plugins: z.record(PluginIdSchema, SemverRangeSchema),
});

export interface IntegrityIssue {
  /** Chiave di traduzione del problema. */
  readonly message: string;
  readonly path: readonly (string | number)[];
  readonly params?: Readonly<Record<string, string>>;
}

/**
 * Controlli che lo schema da solo non puo' fare: riferimenti tra oggetti,
 * unicita', coerenza dei fornitori. Uno show che li viola non si apre.
 */
export function checkShowIntegrity(show: z.infer<typeof ShowShape>): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const add = (message: string, path: (string | number)[], params?: Record<string, string>) => {
    issues.push(params ? { message, path, params } : { message, path });
  };
  const pluginIds = Object.keys(show.plugins);

  const checkKeys = (name: string, record: Readonly<Record<string, { id: string }>>) => {
    for (const [key, value] of Object.entries(record)) {
      if (key !== value.id) add("protocol.show.keyMismatch", [name, key], { id: value.id });
    }
  };
  checkKeys("items", show.items);
  checkKeys("sources", show.sources);
  checkKeys("looks", show.looks);
  checkKeys("scenes", show.scenes);
  checkKeys("outputs", show.outputs);

  const checkProvided = (type: string, path: (string | number)[]) => {
    if (providerOf(type, pluginIds) === undefined) {
      add("protocol.show.pluginNotDeclared", path, { type });
    }
  };

  const entryIds = new Set<string>();
  show.playlist.forEach((entry, i) => {
    if (entryIds.has(entry.id)) add("protocol.show.duplicateId", ["playlist", i], { id: entry.id });
    entryIds.add(entry.id);
    if (!(entry.itemId in show.items)) {
      add("protocol.show.itemMissing", ["playlist", i, "itemId"], { id: entry.itemId });
    }
  });

  for (const item of Object.values(show.items)) {
    checkProvided(item.type, ["items", item.id, "type"]);
    const slideIds = new Set<string>();
    const groups = new Set<string>();
    item.slides.forEach((slide, i) => {
      if (slideIds.has(slide.id)) {
        add("protocol.show.duplicateId", ["items", item.id, "slides", i], { id: slide.id });
      }
      slideIds.add(slide.id);
      if (slide.group !== undefined) groups.add(slide.group);
    });
    item.arrangement?.forEach((group, i) => {
      if (!groups.has(group)) {
        add("protocol.show.groupMissing", ["items", item.id, "arrangement", i], { group });
      }
    });
  }

  for (const source of Object.values(show.sources)) {
    const provider = providerOf(source.type, pluginIds);
    if (provider !== source.provider) {
      add("protocol.show.providerMismatch", ["sources", source.id, "provider"], {
        type: source.type,
        provider: source.provider,
      });
    }
  }

  for (const look of Object.values(show.looks)) {
    checkProvided(look.sourceType, ["looks", look.id, "sourceType"]);
    checkProvided(look.template, ["looks", look.id, "template"]);
  }

  const checkLookFor = (
    sourceId: string,
    lookId: string | undefined,
    path: (string | number)[],
  ) => {
    const source = show.sources[sourceId];
    if (source === undefined) {
      add("protocol.show.sourceMissing", path, { id: sourceId });
      return;
    }
    if (lookId === undefined) return;
    const look = show.looks[lookId];
    if (look === undefined) add("protocol.show.lookMissing", path, { id: lookId });
    else if (look.sourceType !== source.type) {
      add("protocol.show.lookSourceMismatch", path, { look: look.id, source: source.id });
    }
  };

  for (const scene of Object.values(show.scenes)) {
    const elementIds = new Set<string>();
    scene.elements.forEach((element, i) => {
      const path = ["scenes", scene.id, "elements", i];
      if (elementIds.has(element.id)) add("protocol.show.duplicateId", path, { id: element.id });
      elementIds.add(element.id);
      checkLookFor(element.sourceId, element.lookId, path);
    });
  }

  for (const output of Object.values(show.outputs)) {
    const path = ["outputs", output.id, "feed"];
    const expected = output.kind === "display" ? "core" : undefined;
    if (output.kind === "display" && !DisplayTargetSchema.safeParse(output.target).success) {
      add("protocol.show.displayTargetInvalid", ["outputs", output.id, "target"], {
        id: output.id,
      });
    }
    if (expected !== undefined && output.provider !== expected) {
      add("protocol.show.providerMismatch", ["outputs", output.id, "provider"], {
        type: output.kind,
        provider: output.provider,
      });
    }
    if (output.provider !== "core" && !pluginIds.includes(output.provider)) {
      add("protocol.show.pluginNotDeclared", ["outputs", output.id, "provider"], {
        type: output.provider,
      });
    }
    const feed = output.feed;
    if (feed.type === "scene" && !(feed.sceneId in show.scenes)) {
      add("protocol.show.sceneMissing", path, { id: feed.sceneId });
    } else if (feed.type === "source") {
      checkLookFor(feed.sourceId, feed.lookId, path);
    } else if (feed.type === "mirror") {
      if (!(feed.outputId in show.outputs))
        add("protocol.show.outputMissing", path, { id: feed.outputId });
    }
  }

  // Specchi a catena che tornano su se stessi non avrebbero mai un'immagine.
  for (const output of Object.values(show.outputs)) {
    const seen = new Set<string>([output.id]);
    let feed = output.feed;
    while (feed.type === "mirror") {
      if (seen.has(feed.outputId)) {
        add("protocol.show.mirrorCycle", ["outputs", output.id, "feed"], { id: output.id });
        break;
      }
      seen.add(feed.outputId);
      const next = show.outputs[feed.outputId];
      if (next === undefined) break;
      feed = next.feed;
    }
  }

  const ruleIds = new Set<string>();
  show.rules.forEach((rule, i) => {
    if (ruleIds.has(rule.id)) add("protocol.show.duplicateId", ["rules", i], { id: rule.id });
    ruleIds.add(rule.id);
  });

  return issues;
}

export const ShowSchema = ShowShape.superRefine((show, ctx) => {
  for (const issue of checkShowIntegrity(show)) {
    ctx.addIssue({
      code: "custom",
      message: issue.message,
      path: [...issue.path],
      ...(issue.params ? { params: issue.params } : {}),
    });
  }
});
export type Show = z.infer<typeof ShowSchema>;
