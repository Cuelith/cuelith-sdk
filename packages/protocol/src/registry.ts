import { valid } from "semver";
import { z } from "zod";
import { PluginIdSchema } from "./ids.js";
import { LangSchema } from "./locale.js";
import { PermissionSchema, PluginFamilySchema } from "./plugin.js";
import { SemverRangeSchema } from "./show.js";

// Registry dei moduli (cap. 13 e 26, decisione 0004): un file per modulo nel
// repo cuelith-registry; la sua CI pubblica gli indici su GitHub Pages. I
// pacchetti .cpkg (zip) stanno nelle GitHub Releases dei moduli.
//
// Dal protocollo 1.14 (decisione 0013) il registry elenca anche plugin a
// pagamento: il catalogo li presenta e rimanda al negozio del loro autore
// (rivenditore registrato esterno), mai al denaro del progetto.

/** Indirizzo pubblico dell'indice "1" (solo plugin gratuiti, per i programmi gia' installati). */
export const REGISTRY_INDEX_URL = "https://cuelith.github.io/cuelith-registry/index.json";
/** Indirizzo dell'indice "2": tutti i plugin, anche a pagamento, coi campi nuovi. */
export const REGISTRY_INDEX_V2_URL = "https://cuelith.github.io/cuelith-registry/index-2.json";
/**
 * L'indice 1 resta com'era: i programmi gia' installati (fino alla 0.2.5)
 * rifiutano un indice con campi che non conoscono, quindi non si tocca.
 */
export const REGISTRY_SCHEMA_VERSION = 1;
export const REGISTRY_SCHEMA_VERSION_V2 = 2;

/** Fornitori di licenze ammessi: la loro API pubblica attiva e verifica le chiavi. */
export const LICENSE_PROVIDERS = ["lemonsqueezy"] as const;
/** Posti per licenza: computer su cui una chiave puo' essere attiva insieme (decisione 0013). */
export const LICENSE_MAX_DEVICES = 3;

const HttpsUrl = z.url({ protocol: /^https$/, hostname: z.regexes.domain });
/** Pagina di acquisto: solo il negozio di un rivenditore registrato ammesso (contro il phishing). */
const CheckoutUrl = z
  .url({ protocol: /^https$/, hostname: /^(?:[a-z0-9-]+\.)*lemonsqueezy\.com$/ })
  .max(2048)
  // Niente "utente:password@" davanti al nome del sito.
  .refine((u) => !/^https:\/\/[^/?#]*@/.test(u), "protocol.registry.checkoutInvalid");
/** Chiave pubblica Ed25519 (32 byte) o firma (64 byte) in base64url, senza riempimento. */
const Ed25519Key = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "protocol.registry.authorKeyInvalid");
const Ed25519Signature = z
  .string()
  .regex(/^[A-Za-z0-9_-]{86}$/, "protocol.registry.signatureInvalid");

/**
 * Testo firmato dall'autore per ogni pacchetto: lega la firma a modulo,
 * versione e impronta, cosi' una firma non vale per un altro pacchetto.
 */
export function packageSignatureMessage(id: string, version: string, sha256: string): string {
  return ["cuelith-package-v1", id, version, sha256].join("\n");
}
const Version = z.string().refine((v) => valid(v) !== null, "protocol.manifest.versionInvalid");

/**
 * Immagine di copertina di un plugin (dal protocollo 1.19), incorporata come immagine PNG, JPEG
 * o WebP (150 KB al massimo): il marketplace la mostra prima di installare, senza altre richieste.
 */
export const COVER_MAX_BYTES = 150 * 1024;
export const CoverImageSchema = z
  .string()
  .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "protocol.registry.imageInvalid")
  .max(Math.ceil((COVER_MAX_BYTES * 4) / 3) + 64);

/** Un passo della guida d'uso mostrata prima di installare: titolo breve e spiegazione. */
export const GuideStepSchema = z.strictObject({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(600),
});
export type GuideStep = z.infer<typeof GuideStepSchema>;
/** La guida d'uso, nelle lingue che l'autore ha tradotto. */
export const GuideSchema = z.partialRecord(LangSchema, z.array(GuideStepSchema).min(1).max(8));
export type Guide = z.infer<typeof GuideSchema>;

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
  /**
   * Firma Ed25519 del pacchetto con la chiave dell'autore (`authorKey`), sul testo
   * di `packageSignatureMessage`. Senza chiave dell'autore resta "non verificato".
   */
  signature: Ed25519Signature.optional(),
});
export type RegistryVersion = z.infer<typeof RegistryVersionSchema>;

export const LicensingSchema = z.strictObject({
  /** Chi custodisce le chiavi e i posti: l'API pubblica del fornitore le attiva e le verifica. */
  provider: z.enum(LICENSE_PROVIDERS),
  /** Negozio e prodotto presso il fornitore: il notaio controlla che la chiave sia di questo plugin. */
  storeId: z.number().int().positive(),
  productId: z.number().int().positive(),
});
export type Licensing = z.infer<typeof LicensingSchema>;

export const RegistryPluginSchema = z
  .strictObject({
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
    /**
     * Guida d'uso e immagine (dal protocollo 1.19). Non stanno mai negli indici (le app
     * gia' installate rifiutano campi nuovi): viaggiano in `extras.json` e il programma li
     * unisce alla voce. La guida e' scritta nella voce del registry; l'immagine e' un file.
     */
    guide: GuideSchema.optional(),
    image: CoverImageSchema.optional(),
    /** Dalla piu' recente alla piu' vecchia. */
    versions: z.array(RegistryVersionSchema).min(1),
    /** "free" (predefinito: senza il campo e' gratuito) o "paid": si acquista dal negozio dell'autore. */
    access: z.enum(["free", "paid"]).default("free"),
    /** Prezzo come lo mostra il catalogo (testo libero, per esempio "9 €"): il prezzo vero lo dice il negozio. */
    price: z.string().min(1).max(40).optional(),
    /**
     * Pagina di acquisto presso il rivenditore registrato dell'autore. Puo'
     * contenere un riferimento di affiliazione del progetto (volontario per
     * l'autore): il catalogo lo dichiara agli utenti.
     */
    checkoutUrl: CheckoutUrl.optional(),
    /** Come si verifica la licenza di un plugin a pagamento. */
    licensing: LicensingSchema.optional(),
    /** Chiave pubblica con cui l'autore firma i pacchetti (aggiornamenti senza nuova approvazione). */
    authorKey: Ed25519Key.optional(),
  })
  .superRefine((plugin, ctx) => {
    const issue = (message: string, path: string) => {
      ctx.addIssue({ code: "custom", message, path: [path] });
    };
    if (plugin.access === "paid") {
      if (plugin.price === undefined) issue("protocol.registry.paidNeedsPrice", "price");
      if (plugin.checkoutUrl === undefined) {
        issue("protocol.registry.paidNeedsCheckout", "checkoutUrl");
      }
      if (plugin.licensing === undefined)
        issue("protocol.registry.paidNeedsLicensing", "licensing");
    } else {
      if (plugin.price !== undefined) issue("protocol.registry.freeHasPrice", "price");
      if (plugin.checkoutUrl !== undefined)
        issue("protocol.registry.freeHasCheckout", "checkoutUrl");
      if (plugin.licensing !== undefined) issue("protocol.registry.freeHasLicensing", "licensing");
    }
    if (plugin.authorKey !== undefined && plugin.versions.some((v) => v.signature === undefined)) {
      issue("protocol.registry.signatureRequired", "versions");
    }
  });
export type RegistryPlugin = z.infer<typeof RegistryPluginSchema>;

export const RegistryIndexSchema = z
  .strictObject({
    schema: z.union([z.literal(REGISTRY_SCHEMA_VERSION), z.literal(REGISTRY_SCHEMA_VERSION_V2)]),
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

/** Indirizzo pubblico degli extra (dal protocollo 1.19): immagini e guide d'uso dei plugin. */
export const REGISTRY_EXTRAS_URL = "https://cuelith.github.io/cuelith-registry/extras.json";

/** `extras.json`: per ogni plugin l'immagine di copertina e la guida d'uso, se ce l'ha. */
export const RegistryExtrasSchema = z.strictObject({
  schema: z.literal(1),
  generatedAt: z.iso.datetime(),
  plugins: z.record(
    PluginIdSchema,
    z.strictObject({ image: CoverImageSchema.optional(), guide: GuideSchema.optional() }),
  ),
});
export type RegistryExtras = z.infer<typeof RegistryExtrasSchema>;
