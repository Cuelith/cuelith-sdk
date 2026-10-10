import { z } from "zod";

// Testo con parole formattate (protocollo 1.21, decisione 0021). Il testo resta una stringa
// semplice; sopra ci sono degli intervalli ("span") con lo stile di quel pezzo. Chi non conosce
// la formattazione la ignora e legge il testo semplice: importazioni, esportazioni e plugin
// che leggono `value` non si accorgono di niente. Le posizioni sono in unita' UTF-16, come
// `String.length` e le selezioni di una casella di testo.

const Color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const SPAN_SIZE_MIN = 0.5;
export const SPAN_SIZE_MAX = 3;
/** Quanti intervalli al massimo in un testo: oltre, e' un testo fatto male. */
export const MAX_SPANS = 300;

export const SpanSchema = z.strictObject({
  start: z.number().int().min(0),
  end: z.number().int().min(1),
  /** Dimensione come multiplo di quella dello stile (1 = uguale al resto del testo). */
  size: z.number().min(SPAN_SIZE_MIN).max(SPAN_SIZE_MAX).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  color: Color.optional(),
});
export type Span = z.infer<typeof SpanSchema>;

/** Lo stile di un pezzo di testo (quello che un intervallo porta, senza la posizione). */
export interface SpanStyle {
  size?: number | undefined;
  bold?: boolean | undefined;
  italic?: boolean | undefined;
  color?: string | undefined;
}

/** Un testo con le sue parole formattate: e' tutto cio' che serve per disegnarlo o esportarlo. */
export interface RichText {
  readonly text: string;
  readonly spans?: readonly Span[] | undefined;
}

export interface Segment extends SpanStyle {
  readonly text: string;
}

const STYLE_KEYS = ["size", "bold", "italic", "color"] as const;

/** Stile "vuoto": uguale al resto del testo, quindi niente da ricordare. */
const isPlain = (style: SpanStyle): boolean =>
  (style.size === undefined || style.size === 1) &&
  style.bold !== true &&
  style.italic !== true &&
  style.color === undefined;

const sameStyle = (a: SpanStyle, b: SpanStyle): boolean =>
  (a.size ?? 1) === (b.size ?? 1) &&
  (a.bold === true) === (b.bold === true) &&
  (a.italic === true) === (b.italic === true) &&
  a.color === b.color;

/** Lo stile di ogni carattere del testo, ricavato dagli intervalli (l'ultimo in elenco vince). */
function stylesOf(length: number, spans: readonly Span[] | undefined): SpanStyle[] {
  const styles: SpanStyle[] = Array.from({ length }, () => ({}));
  for (const span of spans ?? []) {
    const start = Math.max(0, Math.floor(span.start));
    const end = Math.min(length, Math.floor(span.end));
    for (let index = start; index < end; index += 1) {
      const target = styles[index];
      if (target === undefined) continue;
      for (const key of STYLE_KEYS) {
        const value = span[key];
        if (value !== undefined) (target as Record<string, unknown>)[key] = value;
      }
    }
  }
  return styles;
}

/** Il contrario: dagli stili dei caratteri agli intervalli piu' corti possibili, in ordine, senza buchi inutili. */
function spansOf(styles: readonly SpanStyle[]): Span[] {
  const spans: Span[] = [];
  let index = 0;
  while (index < styles.length) {
    const style = styles[index] ?? {};
    let end = index + 1;
    while (end < styles.length && sameStyle(style, styles[end] ?? {})) end += 1;
    if (!isPlain(style)) {
      const span: Span = { start: index, end };
      if (style.size !== undefined && style.size !== 1) span.size = style.size;
      if (style.bold === true) span.bold = true;
      if (style.italic === true) span.italic = true;
      if (style.color !== undefined) span.color = style.color.toUpperCase();
      spans.push(span);
    }
    index = end;
  }
  return spans;
}

/**
 * Intervalli puliti: dentro il testo, in ordine, senza sovrapposizioni, senza quelli che non
 * cambiano niente e con quelli uguali e vicini uniti. Tiene al massimo MAX_SPANS intervalli.
 */
export function cleanSpans(text: string, spans: readonly Span[] | undefined): Span[] {
  if (spans === undefined || spans.length === 0 || text === "") return [];
  return spansOf(stylesOf(text.length, spans)).slice(0, MAX_SPANS);
}

/** Il testo spezzato in pezzi, ognuno con il suo stile; i pezzi senza stile hanno solo `text`. */
export function segmentsOf(text: string, spans: readonly Span[] | undefined): Segment[] {
  if (text === "") return [];
  const clean = cleanSpans(text, spans);
  const segments: Segment[] = [];
  let at = 0;
  for (const span of clean) {
    if (span.start > at) segments.push({ text: text.slice(at, span.start) });
    const segment: { -readonly [K in keyof Segment]: Segment[K] } = {
      text: text.slice(span.start, span.end),
    };
    if (span.size !== undefined) segment.size = span.size;
    if (span.bold === true) segment.bold = true;
    if (span.italic === true) segment.italic = true;
    if (span.color !== undefined) segment.color = span.color;
    segments.push(segment);
    at = span.end;
  }
  if (at < text.length) segments.push({ text: text.slice(at) });
  return segments;
}

/** Il testo e' formattato davvero (almeno un intervallo che cambia qualcosa)? */
export const hasSpans = (rich: RichText): boolean => cleanSpans(rich.text, rich.spans).length > 0;

/** Esportazione come testo semplice: il testo e basta, senza nessuna formattazione. */
export const plainText = (rich: RichText): string => rich.text;

/**
 * Applica uno stile a un tratto del testo. `toggle` accende il grassetto/corsivo se non c'e'
 * ovunque nel tratto, altrimenti lo spegne (come negli editor di documenti). `size` e `color`
 * con `undefined` tolgono quel pezzo di formattazione dal tratto.
 */
export function styleRange(
  text: string,
  spans: readonly Span[] | undefined,
  start: number,
  end: number,
  change: {
    size?: number | null;
    bold?: boolean | "toggle";
    italic?: boolean | "toggle";
    color?: string | null;
  },
): Span[] {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(text.length, Math.max(start, end));
  if (to <= from) return cleanSpans(text, spans);
  const styles = stylesOf(text.length, spans);
  // Si decide prima di toccare qualcosa: gli stili sono oggetti condivisi con il tratto.
  const allSet = (key: "bold" | "italic"): boolean =>
    styles.slice(from, to).every((style) => style[key] === true);
  const turnOn = {
    bold: change.bold === "toggle" ? !allSet("bold") : change.bold,
    italic: change.italic === "toggle" ? !allSet("italic") : change.italic,
  };
  for (let index = from; index < to; index += 1) {
    const style = styles[index];
    if (style === undefined) continue;
    if (change.size === null) delete style.size;
    else if (change.size !== undefined) style.size = change.size;
    if (change.color === null) delete style.color;
    else if (change.color !== undefined) style.color = change.color.toUpperCase();
    if (turnOn.bold !== undefined) style.bold = turnOn.bold ? true : undefined;
    if (turnOn.italic !== undefined) style.italic = turnOn.italic ? true : undefined;
  }
  return spansOf(styles).slice(0, MAX_SPANS);
}

/**
 * Dopo una modifica del testo, porta con se' la formattazione: cio' che sta prima e dopo il
 * pezzo cambiato resta com'era (spostato), e il testo scritto in mezzo a un tratto formattato
 * prende la formattazione di quel tratto, come in un editor di documenti.
 */
export function shiftSpans(
  before: string,
  after: string,
  spans: readonly Span[] | undefined,
): Span[] {
  if (spans === undefined || spans.length === 0) return [];
  if (before === after) return cleanSpans(after, spans);
  const old = stylesOf(before.length, spans);
  let prefix = 0;
  const shortest = Math.min(before.length, after.length);
  while (prefix < shortest && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < shortest - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const inserted = after.length - prefix - suffix;
  const left = old[prefix - 1];
  const right = old[before.length - suffix];
  const writtenText = after.slice(prefix, prefix + Math.max(0, inserted));
  // In mezzo a un tratto formattato si resta formattati; in fondo a una parola si continua la sua
  // formattazione, ma uno spazio o un "a capo" la chiude (come negli editor di documenti).
  const inherit =
    left !== undefined && right !== undefined && sameStyle(left, right)
      ? left
      : left !== undefined && writtenText !== "" && !/^\s/.test(writtenText)
        ? left
        : {};
  const next: SpanStyle[] = [
    ...old.slice(0, prefix),
    ...Array.from({ length: Math.max(0, inserted) }, () => ({ ...inherit })),
    ...old.slice(before.length - suffix),
  ];
  return spansOf(next).slice(0, MAX_SPANS);
}

/**
 * Porta le parole formattate su un testo ottenuto togliendo dei caratteri a quello di partenza
 * (spazi finali, accordi, separatori...): `keep[j]` e' la posizione, nel testo di partenza, del
 * carattere numero j del testo nuovo. Chi trasforma un testo cosi' non perde la formattazione.
 */
export function remapSpans(
  text: string,
  spans: readonly Span[] | undefined,
  keep: readonly number[],
): Span[] {
  if (spans === undefined || spans.length === 0 || keep.length === 0) return [];
  const styles = stylesOf(text.length, spans);
  return spansOf(keep.map((index) => styles[index] ?? {})).slice(0, MAX_SPANS);
}

/** Un tratto di testo con le sue parole formattate, e dove comincia nel testo intero. */
export interface RichPart extends RichText {
  readonly offset: number;
}

/** Una parte di un testo piu' lungo: gli intervalli che la toccano, ritagliati e spostati. */
export function sliceRich(
  text: string,
  spans: readonly Span[] | undefined,
  from: number,
  to: number,
): RichText {
  const part = text.slice(from, to);
  const clipped: Span[] = [];
  for (const span of cleanSpans(text, spans)) {
    const start = Math.max(span.start, from);
    const end = Math.min(span.end, to);
    if (end > start) clipped.push({ ...span, start: start - from, end: end - from });
  }
  return clipped.length === 0 ? { text: part } : { text: part, spans: clipped };
}

/** Unisce piu' testi in uno, separati da `separator`, portando con se' la formattazione. */
export function joinRich(parts: readonly RichText[], separator: string): RichText {
  let text = "";
  const spans: Span[] = [];
  parts.forEach((part, index) => {
    if (index > 0) text += separator;
    for (const span of cleanSpans(part.text, part.spans)) {
      spans.push({ ...span, start: span.start + text.length, end: span.end + text.length });
    }
    text += part.text;
  });
  return spans.length === 0 ? { text } : { text, spans };
}
