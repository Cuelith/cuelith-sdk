import { valid } from "semver";
import { z } from "zod";
import { PluginIdSchema } from "./ids.js";
import { PermissionSchema, PluginFamilySchema } from "./plugin.js";
import { SemverRangeSchema } from "./show.js";

// Registry dei moduli (cap. 13 e 26, decisione 0004): un file per modulo nel
// repo cuelith-registry; la sua CI pubblica un index.json unico su GitHub
// Pages. I pacchetti .cpkg (zip) stanno nelle GitHub Releases dei moduli.

/** Indirizzo pubblico dell'indice (GitHub Pages dell'organizzazione, costo zero). */
export const REGISTRY_INDEX_URL = "https://cuelith.github.io/cuelith-registry/index.json";
export const REGISTRY_SCHEMA_VERSION = 1;

const HttpsUrl = z.url({ protocol: /^https$/, hostname: z.regexes.domain });
const Version = z.string().refine((v) => valid(v) !== null, "protocol.manifest.versionInvalid");

export const RegistryVersionSchema = z.strictObject({
  version: Version,
  engines: z.strictObject({ cuelith: SemverRangeSchema, protocol: SemverRangeSchema }),
  /** Pacchetto .cpkg da scaricare (solo https). */
  url: HttpsUrl,
  /** Impronta SHA-256 del pacchetto: si verifica prima di installare (cap. 27). */
  sha256: z.string().regex(/^[a-f0-9]{64}$/, "protocol.registry.sha256Invalid"),
  size: z.number().int().positive(),
  /** Permessi del manifest di questa versione, mostrati prima di installare. */
  permissions: z.array(PermissionSchema),
  published: z.iso.datetime(),
  /** Firma del pacchetto (arriva con la firma dei moduli; senza, "non verificato"). */
  signature: z.string().min(1).optional(),
});
export type RegistryVersion = z.infer<typeof RegistryVersionSchema>;

export const RegistryPluginSchema = z.strictObject({
  id: PluginIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  publisher: z.string().min(1),
  license: z.string().min(1),
  repository: HttpsUrl,
  family: PluginFamilySchema,
  /** Modulo controllato dall'organizzazione Cuelith. */
  verified: z.boolean(),
  /**
   * Icona del modulo (dal protocollo 1.6) come immagine SVG incorporata
   * (data:image/svg+xml;base64,...): la CI del registry la prende dal pacchetto
   * e controlla che sia unica. Il marketplace la mostra prima di installare.
   */
  icon: z
    .string()
    .regex(/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/, "protocol.registry.iconInvalid")
    .max(64 * 1024)
    .optional(),
  /** Dalla piu' recente alla piu' vecchia. */
  versions: z.array(RegistryVersionSchema).min(1),
});
export type RegistryPlugin = z.infer<typeof RegistryPluginSchema>;

export const RegistryIndexSchema = z
  .strictObject({
    schema: z.literal(REGISTRY_SCHEMA_VERSION),
    generatedAt: z.iso.datetime(),
    plugins: z.array(RegistryPluginSchema),
  })
  .superRefine((index, ctx) => {
    const seen = new Set<string>();
    index.plugins.forEach((plugin, i) => {
      if (seen.has(plugin.id)) {
        ctx.addIssue({
          code: "custom",
          message: "protocol.registry.duplicateId",
          path: ["plugins", i],
        });
      }
      seen.add(plugin.id);
    });
  });
export type RegistryIndex = z.infer<typeof RegistryIndexSchema>;
