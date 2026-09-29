import { z } from "zod";

// Le lingue sono moduli (famiglia "locale"). Il codice contiene solo chiavi;
// un catalogo e' un JSON piatto chiave -> testo. Segnaposto: {nome}. Plurali:
// chiavi con suffisso "#one", "#other", ... scelte con Intl.PluralRules.

/** Codice lingua BCP 47 semplificato: "it", "en", "pt-BR". */
export const LangSchema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, "protocol.lang.invalid");
export type Lang = z.infer<typeof LangSchema>;

export const MessageKeySchema = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+(?:#(?:zero|one|two|few|many|other))?$/,
    "protocol.messageKey.invalid",
  );

export const CatalogSchema = z.record(MessageKeySchema, z.string());
export type Catalog = z.infer<typeof CatalogSchema>;

export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * Traduce una chiave. Se il catalogo non la contiene restituisce la chiave
 * stessa: resta visibile in interfaccia e i test la intercettano.
 */
export function translate(
  catalog: Catalog,
  lang: Lang,
  key: string,
  params?: MessageParams,
): string {
  let template: string | undefined;
  const count = params?.["count"];
  if (typeof count === "number") {
    const category = new Intl.PluralRules(lang).select(count);
    template = catalog[`${key}#${category}`] ?? catalog[`${key}#other`];
  }
  template ??= catalog[key];
  if (template === undefined) return key;
  if (params === undefined) return template;
  return template.replace(/\{([a-zA-Z0-9]+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === "number" ? new Intl.NumberFormat(lang).format(value) : value;
  });
}

/** Unisce piu' cataloghi; a parita' di chiave vince l'ultimo. */
export function mergeCatalogs(catalogs: readonly Catalog[]): Catalog {
  return Object.assign({}, ...catalogs) as Catalog;
}
