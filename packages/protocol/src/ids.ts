import { ulid } from "ulid";
import { z } from "zod";

// I messaggi di validazione sono chiavi di traduzione, mai testo: la lingua
// e' un modulo (vedi locale.ts).

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Identificatore di un oggetto dello show: sempre un ULID. */
export const IdSchema = z.string().regex(ULID_PATTERN, "protocol.id.invalid");
export type Id = z.infer<typeof IdSchema>;

export function newId(): Id {
  return ulid();
}

/** Identificatore di un modulo in dominio inverso, es. "cuelith.bible". */
export const PluginIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/, "protocol.pluginId.invalid");
export type PluginId = z.infer<typeof PluginIdSchema>;

/** Chi fornisce una sorgente, un'uscita o un tipo: il nucleo o un modulo. */
export const ProviderSchema = z.union([z.literal("core"), PluginIdSchema]);
export type Provider = z.infer<typeof ProviderSchema>;

/**
 * Tipo qualificato di un contributo: "<fornitore>.<id locale>", dove il
 * fornitore e' "core" o l'id del modulo. Es. "core.text",
 * "cuelith.bible.passage" (modulo "cuelith.bible", id locale "passage").
 */
export const QualifiedTypeSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:\.[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)+$/, "protocol.type.invalid");
export type QualifiedType = z.infer<typeof QualifiedTypeSchema>;

/**
 * Id locale di un contributo nel manifest (senza il prefisso del modulo).
 * Ammette il camelCase usato dal documento per eventi e impostazioni
 * ("passageShown", "defaultTranslation").
 */
export const LocalIdSchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]*(?:[.-][a-zA-Z0-9]+)*$/, "protocol.localId.invalid");

export function qualify(provider: Provider, localId: string): QualifiedType {
  return `${provider}.${localId}`;
}

/**
 * Restituisce chi fornisce un tipo qualificato: "core" se inizia per "core.",
 * altrimenti l'id del modulo (tra quelli noti) che ne e' prefisso.
 */
export function providerOf(type: string, knownPluginIds: Iterable<string>): Provider | undefined {
  if (type.startsWith("core.")) return "core";
  let best: string | undefined;
  for (const id of knownPluginIds) {
    if (type.startsWith(`${id}.`) && (best === undefined || id.length > best.length)) best = id;
  }
  return best;
}
