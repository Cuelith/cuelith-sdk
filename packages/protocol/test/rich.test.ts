import { describe, expect, it } from "vitest";
import {
  FieldSchema,
  cleanSpans,
  hasSpans,
  joinRich,
  plainText,
  remapSpans,
  segmentsOf,
  shiftSpans,
  sliceRich,
  styleRange,
  type Span,
} from "../src/index.js";

const text = "Il Signore è il mio pastore";

describe("testo con parole formattate (protocollo 1.21)", () => {
  it("il testo resta una stringa: chi non conosce gli intervalli legge il testo semplice", () => {
    const field = FieldSchema.parse({
      kind: "text",
      value: text,
      spans: [{ start: 3, end: 10, size: 1.5, bold: true }],
    });
    expect(field.kind === "text" && field.value).toBe(text);
    expect(plainText({ text, spans: [{ start: 3, end: 10, bold: true }] })).toBe(text);
    // Un testo scritto prima, senza intervalli, e' valido e uguale.
    expect(FieldSchema.parse({ kind: "text", value: text })).toEqual({ kind: "text", value: text });
  });

  it("rifiuta intervalli fuori dal testo, vuoti o con valori impossibili", () => {
    expect(() =>
      FieldSchema.parse({ kind: "text", value: "abc", spans: [{ start: 1, end: 9, bold: true }] }),
    ).toThrow();
    expect(() =>
      FieldSchema.parse({ kind: "text", value: "abc", spans: [{ start: 1, end: 2, size: 9 }] }),
    ).toThrow();
    expect(() =>
      FieldSchema.parse({
        kind: "text",
        value: "abc",
        spans: [{ start: 1, end: 2, color: "rosso" }],
      }),
    ).toThrow();
    // Gli altri tipi di campo non portano intervalli.
    expect(() => FieldSchema.parse({ kind: "notes", value: "a", spans: [] })).toThrow();
  });

  it("segmenti: tutto il testo, nell'ordine, con lo stile di ognuno", () => {
    const spans: Span[] = [{ start: 3, end: 10, size: 1.5, bold: true }];
    const segments = segmentsOf(text, spans);
    expect(segments.map((segment) => segment.text).join("")).toBe(text);
    expect(segments).toEqual([
      { text: "Il " },
      { text: "Signore", size: 1.5, bold: true },
      { text: " è il mio pastore" },
    ]);
    expect(segmentsOf("", spans)).toEqual([]);
  });

  it("intervalli puliti: ordinati, senza sovrapposizioni, senza quelli che non cambiano niente", () => {
    const messy: Span[] = [
      { start: 5, end: 9, bold: true },
      { start: 0, end: 3, size: 1 },
      { start: 7, end: 12, bold: true, italic: true },
      { start: 100, end: 120, bold: true },
    ];
    expect(cleanSpans(text, messy)).toEqual([
      { start: 5, end: 7, bold: true },
      { start: 7, end: 12, bold: true, italic: true },
    ]);
    expect(hasSpans({ text, spans: [{ start: 0, end: 3, size: 1 }] })).toBe(false);
    expect(hasSpans({ text, spans: [{ start: 0, end: 3, size: 2 }] })).toBe(true);
  });

  it("applicare uno stile a un tratto: grassetto che si accende e si spegne", () => {
    let spans = styleRange(text, [], 3, 10, { bold: "toggle" });
    expect(spans).toEqual([{ start: 3, end: 10, bold: true }]);
    spans = styleRange(text, spans, 3, 10, { bold: "toggle" });
    expect(spans).toEqual([]);
    spans = styleRange(text, spans, 3, 10, { size: 2, color: "#ff0000" });
    expect(spans).toEqual([{ start: 3, end: 10, size: 2, color: "#FF0000" }]);
    spans = styleRange(text, spans, 5, 8, { size: null });
    expect(spans).toEqual([
      { start: 3, end: 5, size: 2, color: "#FF0000" },
      { start: 5, end: 8, color: "#FF0000" },
      { start: 8, end: 10, size: 2, color: "#FF0000" },
    ]);
  });

  it("scrivere nel testo porta con se' la formattazione", () => {
    const spans: Span[] = [{ start: 3, end: 10, bold: true }];
    // Prima del tratto: tutto si sposta.
    expect(shiftSpans(text, `Oh, ${text}`, spans)).toEqual([{ start: 7, end: 14, bold: true }]);
    // In mezzo al tratto: il testo scritto e' formattato come il resto del tratto.
    const middle = text.replace("Signore", "Signoreee");
    expect(shiftSpans(text, middle, spans)).toEqual([{ start: 3, end: 12, bold: true }]);
    // Dopo il tratto: non cambia niente.
    expect(shiftSpans(text, `${text}!`, spans)).toEqual(spans);
    // Cancellare tutto il tratto toglie la formattazione.
    expect(shiftSpans(text, text.replace("Signore ", ""), spans)).toEqual([]);
    // Nessun intervallo: nessun lavoro e nessuna formattazione inventata.
    expect(shiftSpans(text, `${text}!`, undefined)).toEqual([]);
  });

  it("slide e testo intero: tagliare e unire non perde la formattazione", () => {
    const first = { text: "uno due", spans: [{ start: 4, end: 7, bold: true }] };
    const second = { text: "tre", spans: [{ start: 0, end: 3, italic: true }] };
    const joined = joinRich([first, second], "\n\n");
    expect(joined.text).toBe("uno due\n\ntre");
    expect(joined.spans).toEqual([
      { start: 4, end: 7, bold: true },
      { start: 9, end: 12, italic: true },
    ]);
    expect(sliceRich(joined.text, joined.spans, 0, 7)).toEqual(first);
    expect(sliceRich(joined.text, joined.spans, 9, 12)).toEqual(second);
    expect(sliceRich(joined.text, joined.spans, 0, 3)).toEqual({ text: "uno" });
  });
});

describe("trasformazioni che tolgono caratteri (protocollo 1.23)", () => {
  it("la formattazione segue i caratteri che restano", () => {
    // "Il [G]Signore": si tolgono gli accordi e la formattazione sta sulla parola.
    const original = "Il [G]Signore e' qui";
    const spans: Span[] = [{ start: 6, end: 13, bold: true }];
    const keep: number[] = [];
    for (let index = 0; index < original.length; index += 1) {
      if (index >= 3 && index < 6) continue;
      keep.push(index);
    }
    const stripped = keep.map((index) => original.charAt(index)).join("");
    expect(stripped).toBe("Il Signore e' qui");
    expect(remapSpans(original, spans, keep)).toEqual([{ start: 3, end: 10, bold: true }]);
    expect(stripped.slice(3, 10)).toBe("Signore");
  });

  it("senza formattazione o senza caratteri non c'e' niente da portare", () => {
    expect(remapSpans("abc", undefined, [0, 1])).toEqual([]);
    expect(remapSpans("abc", [{ start: 0, end: 3, bold: true }], [])).toEqual([]);
  });
});

describe("bordo e ombra delle parole (protocollo 1.24)", () => {
  const outline = { width: 3, color: "#000000" };
  const shadow = { offset: 4, blur: 6, color: "#112233" };

  it("si accettano nel campo di testo e si rifiutano valori impossibili", () => {
    const field = FieldSchema.parse({
      kind: "text",
      value: "Santo",
      spans: [{ start: 0, end: 5, outline, shadow }],
    });
    expect(field.kind === "text" && field.spans).toEqual([{ start: 0, end: 5, outline, shadow }]);
    expect(() =>
      FieldSchema.parse({
        kind: "text",
        value: "Santo",
        spans: [{ start: 0, end: 5, outline: { width: 99, color: "#000000" } }],
      }),
    ).toThrow();
    expect(() =>
      FieldSchema.parse({
        kind: "text",
        value: "Santo",
        spans: [{ start: 0, end: 5, shadow: { offset: 1, blur: 1 } }],
      }),
    ).toThrow();
  });

  it("applicare e togliere il bordo e l'ombra a un tratto, senza toccare il resto", () => {
    let spans = styleRange(text, [], 3, 10, { bold: true, outline, shadow });
    expect(spans).toEqual([{ start: 3, end: 10, bold: true, outline, shadow }]);
    spans = styleRange(text, spans, 5, 8, { outline: null });
    expect(spans).toEqual([
      { start: 3, end: 5, bold: true, outline, shadow },
      { start: 5, end: 8, bold: true, shadow },
      { start: 8, end: 10, bold: true, outline, shadow },
    ]);
    spans = styleRange(text, spans, 0, text.length, { shadow: null, outline: null, bold: false });
    expect(spans).toEqual([]);
  });

  it("segmenti e spostamenti portano il bordo e l'ombra", () => {
    const spans: Span[] = [{ start: 3, end: 10, outline: { width: 2, color: "#ff0000" } }];
    expect(segmentsOf(text, spans)[1]).toEqual({
      text: "Signore",
      outline: { width: 2, color: "#FF0000" },
    });
    expect(shiftSpans(text, `Oh, ${text}`, spans)).toEqual([
      { start: 7, end: 14, outline: { width: 2, color: "#FF0000" } },
    ]);
    expect(hasSpans({ text, spans: [{ start: 0, end: 3 }] })).toBe(false);
  });
});
