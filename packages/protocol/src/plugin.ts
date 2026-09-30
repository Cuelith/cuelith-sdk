import { valid } from "semver";
import { z } from "zod";
import { LocalIdSchema, PluginIdSchema, QualifiedTypeSchema, providerOf } from "./ids.js";
import { LangSchema, MessageKeySchema } from "./locale.js";
import { areaPanelIds, CORE_PANELS, ModeContributionSchema } from "./mode.js";
import { SemverRangeSchema } from "./show.js";

// Manifest di un modulo: cuelith-plugin.json (cap. 24), con le aggiunte
// decise per Cuelith: famiglia "locale", runtime "none" (moduli di soli
// dati, nessun processo), contributes.locales.

export const PLUGIN_MANIFEST_FILE = "cuelith-plugin.json";
export const PLUGIN_PACKAGE_EXTENSION = ".cpkg";

export const PLUGIN_FAMILIES = [
  "function",
  "mode",
  "video",
  "audio",
  "control",
  "integration",
  "locale",
] as const;
export const PluginFamilySchema = z.enum(PLUGIN_FAMILIES);
export type PluginFamily = z.infer<typeof PluginFamilySchema>;

export const NATIVE_PLATFORMS = [
  "win-x64",
  "win-arm64",
  "mac-x64",
  "mac-arm64",
  "linux-x64",
  "linux-arm64",
] as const;

const RelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (p) => !p.startsWith("/") && !/^[a-zA-Z]:/.test(p) && !p.split(/[\\/]/).includes(".."),
    "protocol.manifest.pathOutside",
  );

export const RuntimeSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("node"), entry: RelativePathSchema }),
  z.strictObject({
    type: z.literal("native"),
    bin: z.partialRecord(z.enum(NATIVE_PLATFORMS), RelativePathSchema),
  }),
  z.strictObject({ type: z.literal("none") }),
]);
export type Runtime = z.infer<typeof RuntimeSchema>;

/**
 * storage | network | network:<host> | fs:read | fs:write | devices:video |
 * devices:audio | devices:midi | serial. Mostrati all'utente prima di
 * installare; nuovi permessi in un aggiornamento chiedono nuova approvazione.
 */
export const PermissionSchema = z
  .string()
  .regex(
    /^(?:storage|network|network:[a-z0-9-]+(?:\.[a-z0-9-]+)+|fs:read|fs:write|devices:video|devices:audio|devices:midi|serial)$/,
    "protocol.manifest.permissionInvalid",
  );
export type Permission = z.infer<typeof PermissionSchema>;

const Titled = z.strictObject({ id: LocalIdSchema, title: MessageKeySchema });

export const ContributesSchema = z.strictObject({
  modes: z.array(ModeContributionSchema).optional(),
  panels: z
    .array(
      z.strictObject({
        id: LocalIdSchema,
        title: MessageKeySchema,
        icon: z.string().min(1).optional(),
        /**
         * Dove compare nelle modalita' del nucleo (dal protocollo 1.4): "side" =
         * scheda nella colonna di sinistra (elenchi); "center" = al posto della
         * colonna Slide finche' e' aperto (editor), col programma sempre visibile.
         */
        placement: z.enum(["side", "center"]).optional(),
      }),
    )
    .optional(),
  itemTypes: z.array(Titled).optional(),
  sourceTypes: z.array(Titled).optional(),
  outputKinds: z.array(Titled).optional(),
  lookTemplates: z
    .array(
      z.strictObject({
        id: LocalIdSchema,
        title: MessageKeySchema,
        sourceType: QualifiedTypeSchema,
      }),
    )
    .optional(),
  commands: z.array(Titled).optional(),
  events: z.array(LocalIdSchema).optional(),
  settings: z
    .array(
      z.strictObject({
        key: LocalIdSchema,
        title: MessageKeySchema,
        type: z.enum(["string", "number", "boolean"]),
        default: z.union([z.string(), z.number(), z.boolean()]).optional(),
      }),
    )
    .optional(),
  extensionPoints: z
    .array(z.strictObject({ id: LocalIdSchema, schema: RelativePathSchema }))
    .optional(),
  locales: z
    .array(
      z.strictObject({
        lang: LangSchema,
        file: RelativePathSchema,
        name: z.string().min(1).optional(),
      }),
    )
    .optional(),
});
export type Contributes = z.infer<typeof ContributesSchema>;

const ManifestShape = z.strictObject({
  $schema: z.string().optional(),
  /** Dominio inverso, unico nel registry. */
  id: PluginIdSchema,
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  version: z.string().refine((v) => valid(v) !== null, "protocol.manifest.versionInvalid"),
  publisher: z.string().min(1),
  license: z.string().min(1),
  repository: z.url(),
  family: PluginFamilySchema,
  engines: z.strictObject({ cuelith: SemverRangeSchema, protocol: SemverRangeSchema }),
  runtime: RuntimeSchema,
  /** Pannelli, caricati in iframe isolati. */
  ui: z.strictObject({ entry: RelativePathSchema }).optional(),
  permissions: z.array(PermissionSchema),
  dependencies: z.record(PluginIdSchema, SemverRangeSchema),
  /** Es. [{ "point": "cuelith.bible/translations" }]. */
  extends: z.array(
    z.strictObject({
      point: z.string().regex(/^[a-z0-9.-]+\/[a-z0-9.-]+$/, "protocol.manifest.pointInvalid"),
    }),
  ),
  /** Es. ["service:transitions"]. */
  provides: z.array(z.string().regex(/^service:[a-z0-9.-]+$/, "protocol.manifest.serviceInvalid")),
  contributes: ContributesSchema,
  /** Documentazione completa (dal protocollo 1.4): si apre dalla pagina dei moduli. */
  docs: z.strictObject({ url: z.url({ protocol: /^https$/ }) }).optional(),
  /**
   * Guida al primo uso, mostrata subito dopo l'installazione e riapribile
   * (dal protocollo 1.4). Testi come chiavi del modulo, tradotte dai suoi cataloghi.
   */
  onboarding: z
    .array(
      z.strictObject({
        title: MessageKeySchema,
        body: MessageKeySchema,
        image: RelativePathSchema.optional(),
      }),
    )
    .min(1)
    .max(8)
    .optional(),
});

export const PluginManifestSchema = ManifestShape.superRefine((m, ctx) => {
  const issue = (message: string, path: (string | number)[]) => {
    ctx.addIssue({ code: "custom", message, path });
  };
  const c = m.contributes;

  const unique = (list: readonly { id: string }[] | undefined, name: string) => {
    const seen = new Set<string>();
    list?.forEach((entry, i) => {
      if (seen.has(entry.id)) issue("protocol.manifest.duplicateId", ["contributes", name, i]);
      seen.add(entry.id);
    });
  };
  unique(c.modes, "modes");
  unique(c.panels, "panels");
  unique(c.itemTypes, "itemTypes");
  unique(c.sourceTypes, "sourceTypes");
  unique(c.outputKinds, "outputKinds");
  unique(c.lookTemplates, "lookTemplates");
  unique(c.commands, "commands");
  unique(c.extensionPoints, "extensionPoints");

  // Le chiavi di traduzione di un modulo stanno nel suo spazio, cosi' due
  // moduli non si sovrascrivono i testi a vicenda.
  const ownKey = (key: string, path: (string | number)[]) => {
    if (!key.startsWith(`${m.id}.`)) issue("protocol.manifest.keyOutsideNamespace", path);
  };
  c.modes?.forEach((mode, i) => {
    ownKey(mode.title, ["contributes", "modes", i, "title"]);
  });
  m.onboarding?.forEach((step, i) => {
    ownKey(step.title, ["onboarding", i, "title"]);
    ownKey(step.body, ["onboarding", i, "body"]);
  });
  c.panels?.forEach((p, i) => {
    ownKey(p.title, ["contributes", "panels", i, "title"]);
  });
  c.itemTypes?.forEach((t, i) => {
    ownKey(t.title, ["contributes", "itemTypes", i, "title"]);
  });
  c.sourceTypes?.forEach((t, i) => {
    ownKey(t.title, ["contributes", "sourceTypes", i, "title"]);
  });
  c.outputKinds?.forEach((t, i) => {
    ownKey(t.title, ["contributes", "outputKinds", i, "title"]);
  });
  c.lookTemplates?.forEach((t, i) => {
    ownKey(t.title, ["contributes", "lookTemplates", i, "title"]);
  });
  c.commands?.forEach((t, i) => {
    ownKey(t.title, ["contributes", "commands", i, "title"]);
  });
  c.settings?.forEach((s, i) => {
    ownKey(s.title, ["contributes", "settings", i, "title"]);
  });

  const hasCode = m.runtime.type !== "none";
  if (!hasCode && (c.commands?.length ?? 0) > 0)
    issue("protocol.manifest.commandsNeedRuntime", ["contributes", "commands"]);
  if (!hasCode && (c.events?.length ?? 0) > 0)
    issue("protocol.manifest.eventsNeedRuntime", ["contributes", "events"]);
  if ((c.panels?.length ?? 0) > 0 && m.ui === undefined)
    issue("protocol.manifest.panelsNeedUi", ["ui"]);

  if (m.family === "locale") {
    if (m.runtime.type !== "none") issue("protocol.manifest.localeNeedsNoRuntime", ["runtime"]);
    if ((c.locales?.length ?? 0) === 0)
      issue("protocol.manifest.localeNeedsLocales", ["contributes", "locales"]);
  }

  // Una modalita' puo' mostrare pannelli del nucleo, del modulo stesso o dei
  // moduli da cui dipende: mai pannelli di moduli che potrebbero mancare.
  const candidates = [m.id, ...Object.keys(m.dependencies)];
  const ownPanels = new Set((c.panels ?? []).map((p) => `${m.id}.${p.id}`));
  c.modes?.forEach((mode, i) => {
    for (const [area, panels] of Object.entries(mode.layout.panels)) {
      for (const panel of areaPanelIds(panels)) {
        const path = ["contributes", "modes", i, "layout", "panels", area];
        const provider = providerOf(panel, candidates);
        if (provider === undefined) issue("protocol.manifest.panelNotAvailable", path);
        else if (provider === "core" && !(CORE_PANELS as readonly string[]).includes(panel)) {
          issue("protocol.manifest.panelNotAvailable", path);
        } else if (provider === m.id && !ownPanels.has(panel))
          issue("protocol.manifest.panelNotDeclared", path);
      }
    }
  });

  for (const dep of Object.keys(m.dependencies)) {
    if (dep === m.id) issue("protocol.manifest.selfDependency", ["dependencies", dep]);
  }
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
