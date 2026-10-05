import { z } from "zod";
import { PluginIdSchema } from "./ids.js";

// Licenze dei plugin a pagamento (decisione 0013). Il permesso e' un testo
// firmato dal Notaio del progetto con la sua chiave Ed25519 e legato alla
// chiave pubblica del computer: si verifica senza internet, qui, con le chiavi
// pubbliche del Notaio incluse nel codice. Il programma e il plugin lo
// verificano con le stesse funzioni (WebCrypto: vale in Node e nel browser).
//
// Cosa NON c'e': nessun identificativo hardware, nessun nome del computer,
// nessun dato personale. Il computer e' una coppia di chiavi casuale, generata
// e custodita sul computer stesso (cifrata dal sistema operativo).

/** Indirizzo del Notaio (funzioni del sito del progetto). */
export const LICENSE_NOTARY_URL = "https://cuelith.lzrhive.it/api/license";

/**
 * Chiavi pubbliche del Notaio, per identificativo (`kid` nel permesso): un elenco
 * per poter cambiare chiave senza rompere i permessi gia' emessi.
 */
export const NOTARY_PUBLIC_KEYS: Readonly<Record<string, string>> = {
  n1: "5lToPBMM2bePCMUbSl8NGl0wrXKS8OnxpSuj5gESaN8",
};

/** Computer su cui una chiave puo' essere attiva insieme (lo fa rispettare il fornitore). */
export const LICENSE_MAX_DEVICES_PER_KEY = 3;

const TOKEN_DOMAIN = "cuelith-license-v1";
const PROOF_DOMAIN = "cuelith-license-proof-v1";

const Ed25519Key = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** Contenuto del permesso firmato dal Notaio. Tempi in secondi dal 1970. */
export const LicenseTokenPayloadSchema = z.strictObject({
  v: z.literal(1),
  /** Quale chiave del Notaio l'ha firmato (vedi NOTARY_PUBLIC_KEYS). */
  kid: z.string().min(1).max(32),
  plugin: PluginIdSchema,
  /** Chiave pubblica del computer a cui e' legato. */
  device: Ed25519Key,
  /** Posto presso il fornitore (serve a rinnovare e a liberare). */
  instance: z.string().min(8).max(64),
  iat: z.number().int().nonnegative(),
  /** Da qui il programma prova a rinnovare in silenzio. */
  renewAfter: z.number().int().nonnegative(),
  /** Dopo questo istante il permesso non vale piu' senza un rinnovo. */
  exp: z.number().int().nonnegative(),
  /** Presente solo per le chiavi di prova del fornitore. */
  test: z.literal(true).optional(),
});
export type LicenseTokenPayload = z.infer<typeof LicenseTokenPayloadSchema>;

/**
 * Stato della licenza di un plugin:
 * - `none`: nessuna licenza su questo computer;
 * - `active`: valida;
 * - `renew`: valida ma da rinnovare (passati 30 giorni): il plugin funziona, il rinnovo e' in corso;
 * - `expired`: passati 90 giorni senza rinnovo: il plugin non parte al prossimo avvio;
 * - `revoked`: il fornitore l'ha disattivata (rimborso): idem.
 */
export const LICENSE_STATES = ["none", "active", "renew", "expired", "revoked"] as const;
export const LicenseStateSchema = z.enum(LICENSE_STATES);
export type LicenseState = z.infer<typeof LicenseStateSchema>;

export const LicenseStatusSchema = z.strictObject({
  pluginId: PluginIdSchema,
  state: LicenseStateSchema,
  /** Fino a quando vale senza rinnovo. */
  expires: z.iso.datetime().optional(),
  /** Da quando si prova a rinnovare. */
  renewAfter: z.iso.datetime().optional(),
  /** Chiave di prova del fornitore (non una vera vendita). */
  test: z.boolean().optional(),
});
export type LicenseStatus = z.infer<typeof LicenseStatusSchema>;

/** Prova di possesso che un plugin chiede al nucleo: permesso piu' firma del computer su una sfida. */
export const LicenseProofSchema = z.strictObject({
  token: z.string().min(1).max(2048),
  signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
});
export type LicenseProof = z.infer<typeof LicenseProofSchema>;

// ---- verifica (WebCrypto, senza dipendenze) ----

interface SubtleLike {
  importKey(
    format: "raw",
    key: Uint8Array,
    algorithm: string,
    extractable: boolean,
    usages: string[],
  ): Promise<unknown>;
  verify(
    algorithm: string,
    key: unknown,
    signature: Uint8Array,
    data: Uint8Array,
  ): Promise<boolean>;
}
/** Codifica e decodifica del testo: stesse funzioni di Node e del browser (la compilazione non ne conosce i tipi). */
const encoding = globalThis as unknown as {
  TextEncoder: new () => { encode(text: string): Uint8Array };
  TextDecoder: new () => { decode(bytes: Uint8Array): string };
  atob(data: string): string;
};
const subtle = (): SubtleLike =>
  (globalThis as unknown as { crypto: { subtle: SubtleLike } }).crypto.subtle;

function fromBase64Url(text: string): Uint8Array {
  const base = text.replace(/-/g, "+").replace(/_/g, "/");
  const raw = encoding.atob(base + "=".repeat((4 - (base.length % 4)) % 4));
  return Uint8Array.from(raw, (c: string) => c.charCodeAt(0));
}

async function verifyEd25519(
  publicKey: string,
  message: string,
  signature: Uint8Array,
): Promise<boolean> {
  try {
    const key = await subtle().importKey("raw", fromBase64Url(publicKey), "Ed25519", false, [
      "verify",
    ]);
    return await subtle().verify(
      "Ed25519",
      key,
      signature,
      new encoding.TextEncoder().encode(message),
    );
  } catch {
    return false;
  }
}

export interface VerifyLicenseOptions {
  /** Chiavi del Notaio ammesse (predefinito: NOTARY_PUBLIC_KEYS). */
  readonly keys?: Readonly<Record<string, string>>;
  /** Se c'e', il permesso deve essere per questo plugin. */
  readonly pluginId?: string;
  /** Se c'e', il permesso deve essere legato a questa chiave del computer. */
  readonly devicePublicKey?: string;
  /** Istante di riferimento in millisecondi (predefinito: adesso). */
  readonly now?: number;
}

/**
 * Verifica un permesso: firma del Notaio, forma, plugin e computer attesi,
 * scadenza. Restituisce il contenuto, o undefined se qualcosa non torna. Un
 * permesso scaduto NON e' valido qui: il chiamante decide cosa fare per il
 * rinnovo guardando `renewAfter`.
 */
export async function verifyLicenseToken(
  token: string,
  options: VerifyLicenseOptions = {},
): Promise<LicenseTokenPayload | undefined> {
  const [body, signature, extra] = token.split(".");
  if (body === undefined || signature === undefined || extra !== undefined) return undefined;
  let payload: LicenseTokenPayload;
  try {
    const parsed = LicenseTokenPayloadSchema.safeParse(
      JSON.parse(new encoding.TextDecoder().decode(fromBase64Url(body))),
    );
    if (!parsed.success) return undefined;
    payload = parsed.data;
  } catch {
    return undefined;
  }
  const publicKey = (options.keys ?? NOTARY_PUBLIC_KEYS)[payload.kid];
  if (publicKey === undefined) return undefined;
  let signed: Uint8Array;
  try {
    signed = fromBase64Url(signature);
  } catch {
    return undefined;
  }
  if (!(await verifyEd25519(publicKey, `${TOKEN_DOMAIN}\n${body}`, signed))) return undefined;
  if (options.pluginId !== undefined && payload.plugin !== options.pluginId) return undefined;
  if (options.devicePublicKey !== undefined && payload.device !== options.devicePublicKey) {
    return undefined;
  }
  if (payload.exp * 1000 <= (options.now ?? Date.now())) return undefined;
  return payload;
}

/** Testo che il computer firma per dimostrare di essere quello del permesso (sfida del plugin). */
export function licenseProofMessage(pluginId: string, nonce: string): string {
  return [PROOF_DOMAIN, pluginId, nonce].join("\n");
}

/**
 * Verifica la prova che il nucleo da' a un plugin: il permesso e' valido per
 * quel plugin e la firma sulla sfida e' del computer a cui e' legato. Chi si
 * fa passare per il nucleo non puo' inventare ne' il permesso (lo firma solo
 * il Notaio) ne' la firma (serve la chiave privata del computer).
 */
export async function verifyLicenseProof(
  proof: LicenseProof,
  options: VerifyLicenseOptions & { readonly pluginId: string; readonly nonce: string },
): Promise<LicenseTokenPayload | undefined> {
  const payload = await verifyLicenseToken(proof.token, options);
  if (payload === undefined) return undefined;
  let signature: Uint8Array;
  try {
    signature = fromBase64Url(proof.signature);
  } catch {
    return undefined;
  }
  const ok = await verifyEd25519(
    payload.device,
    licenseProofMessage(options.pluginId, options.nonce),
    signature,
  );
  return ok ? payload : undefined;
}
