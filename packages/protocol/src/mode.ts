import { z } from "zod";
import { LocalIdSchema, QualifiedTypeSchema } from "./ids.js";

// Una modalita' e' solo una disposizione di pannelli nella postazione, con le
// sue scorciatoie (cap. 16). Non tocca mai le uscite. Il nucleo definisce
// "Presenta" con lo stesso schema che usano i moduli.

/** Dimensione di una traccia della griglia: "3fr", "240px", "auto", "minmax(200px, 2fr)". */
export const TrackSizeSchema = z
  .string()
  .regex(
    /^(?:\d+(?:\.\d+)?fr|\d+px|auto|minmax\(\s*\d+px\s*,\s*\d+(?:\.\d+)?fr\s*\))$/,
    "protocol.layout.trackInvalid",
  );

export const AreaNameSchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]*$/, "protocol.layout.areaInvalid");

/** Area vuota nella matrice delle aree. */
export const EMPTY_AREA = ".";

export interface AreaRect {
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly colStart: number;
  readonly colEnd: number;
}

/**
 * Rettangolo occupato da ogni area (indici base 0, fine esclusa). Restituisce
 * undefined se un'area non e' un rettangolo pieno.
 */
export function layoutAreaRects(
  areas: readonly (readonly string[])[],
): Record<string, AreaRect> | undefined {
  const bounds: Record<
    string,
    { rowStart: number; rowEnd: number; colStart: number; colEnd: number; cells: number }
  > = {};
  areas.forEach((row, r) => {
    row.forEach((name, c) => {
      if (name === EMPTY_AREA) return;
      const b = bounds[name];
      if (b === undefined) {
        bounds[name] = { rowStart: r, rowEnd: r + 1, colStart: c, colEnd: c + 1, cells: 1 };
      } else {
        b.rowStart = Math.min(b.rowStart, r);
        b.rowEnd = Math.max(b.rowEnd, r + 1);
        b.colStart = Math.min(b.colStart, c);
        b.colEnd = Math.max(b.colEnd, c + 1);
        b.cells += 1;
      }
    });
  });
  const rects: Record<string, AreaRect> = {};
  for (const [name, b] of Object.entries(bounds)) {
    if ((b.rowEnd - b.rowStart) * (b.colEnd - b.colStart) !== b.cells) return undefined;
    for (let r = b.rowStart; r < b.rowEnd; r++) {
      for (let c = b.colStart; c < b.colEnd; c++) {
        if (areas[r]?.[c] !== name) return undefined;
      }
    }
    rects[name] = {
      rowStart: b.rowStart,
      rowEnd: b.rowEnd,
      colStart: b.colStart,
      colEnd: b.colEnd,
    };
  }
  return rects;
}

/** Un pannello, o piu' pannelli a schede (almeno due, senza ripetizioni). */
export const AreaPanelsSchema = z.union([
  QualifiedTypeSchema,
  z
    .array(QualifiedTypeSchema)
    .min(2)
    .refine((ids) => new Set(ids).size === ids.length, "protocol.layout.duplicatePanel"),
]);
export type AreaPanels = z.infer<typeof AreaPanelsSchema>;

/** Pannelli di un'area come elenco (uno solo se non ci sono schede). */
export const areaPanelIds = (panels: AreaPanels): readonly string[] =>
  typeof panels === "string" ? [panels] : panels;

export const LayoutSchema = z
  .strictObject({
    columns: z.array(TrackSizeSchema).min(1),
    rows: z.array(TrackSizeSchema).min(1),
    /** Matrice righe x colonne di nomi d'area; "." = vuoto. */
    areas: z.array(z.array(z.union([AreaNameSchema, z.literal(EMPTY_AREA)]))).min(1),
    /**
     * Area -> id qualificato del pannello, es. "core.slides", oppure un elenco
     * di pannelli mostrati come schede nella stessa area (dal protocollo 1.2).
     */
    panels: z.record(AreaNameSchema, AreaPanelsSchema),
  })
  .superRefine((layout, ctx) => {
    if (layout.areas.length !== layout.rows.length) {
      ctx.addIssue({ code: "custom", message: "protocol.layout.rowsMismatch", path: ["areas"] });
      return;
    }
    layout.areas.forEach((row, r) => {
      if (row.length !== layout.columns.length) {
        ctx.addIssue({
          code: "custom",
          message: "protocol.layout.columnsMismatch",
          path: ["areas", r],
        });
      }
    });
    const rects = layoutAreaRects(layout.areas);
    if (rects === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "protocol.layout.areaNotRectangular",
        path: ["areas"],
      });
      return;
    }
    for (const name of Object.keys(rects)) {
      if (!(name in layout.panels)) {
        ctx.addIssue({
          code: "custom",
          message: "protocol.layout.panelMissing",
          path: ["panels", name],
        });
      }
    }
    for (const name of Object.keys(layout.panels)) {
      if (!(name in rects)) {
        ctx.addIssue({
          code: "custom",
          message: "protocol.layout.areaUnused",
          path: ["panels", name],
        });
      }
    }
  });
export type Layout = z.infer<typeof LayoutSchema>;

/** Scorciatoia: "Mod+1" (Mod = Ctrl su Windows/Linux, Cmd su Mac), "Mod+Shift+K", "F1". */
export const ShortcutSchema = z
  .string()
  .regex(
    /^(?:(?:Mod|Shift|Alt)\+)*(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Space|Enter|Escape)$/,
    "protocol.shortcut.invalid",
  );

export const ModeContributionSchema = z.strictObject({
  id: LocalIdSchema,
  /** Chiave di traduzione del nome della modalita'. */
  title: z.string().min(1),
  shortcut: ShortcutSchema.optional(),
  icon: z.string().min(1).optional(),
  layout: LayoutSchema,
});
export type ModeContribution = z.infer<typeof ModeContributionSchema>;

/** Pannelli forniti dal nucleo, disponibili a ogni modalita'. */
export const CORE_PANELS = [
  "core.playlist",
  "core.library",
  "core.slides",
  "core.program",
  "core.preview",
  "core.outputs",
  "core.editor",
  // Dal protocollo 1.7, per le disposizioni Band, Conferenza e Regia:
  /** Sezioni dell'elemento in onda come grossi pulsanti (V1 C1 B1...). */
  "core.sections",
  /** Striscia dell'ordine di proiezione. */
  "core.order",
  /** Timer della regia con i colori del tempo. */
  "core.timer",
  /** Messaggio ai monitor del palco. */
  "core.stage",
  /** Note della slide in onda e della successiva. */
  "core.notes",
  /** Comandi tra anteprima e programma: TAKE, avanti, indietro, nero. */
  "core.transitions",
  // Dal protocollo 1.12:
  /** Sfondi dei testi: miniature delle immagini dell'archivio, velo (decisione 0003). */
  "core.backgrounds",
] as const;
export type CorePanelId = (typeof CORE_PANELS)[number];
