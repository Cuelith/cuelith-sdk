import { describe, expect, it } from "vitest";
import { layoutAreaRects, LayoutSchema, type Layout } from "../src/index.js";

// I layout delle modalita' previste dal documento (cap. 16) devono essere
// esprimibili con lo schema: se uno di questi test fallisce, lo schema non
// basta alle modalita' future e va cambiato prima di costruirle.

const presenta: Layout = {
  columns: ["22fr", "40fr", "38fr"],
  rows: ["3fr", "2fr"],
  areas: [
    ["playlist", "slides", "program"],
    ["playlist", "slides", "preview"],
  ],
  panels: {
    playlist: "core.playlist",
    slides: "core.slides",
    program: "core.program",
    preview: "core.preview",
  },
};

const futureModes: Record<string, Layout> = {
  culto: {
    columns: ["20fr", "42fr", "26fr"],
    rows: ["40fr", "20fr", "34fr"],
    areas: [
      ["playlist", "slides", "program"],
      ["playlist", "slides", "side"],
      ["playlist", ".", "side"],
    ],
    panels: {
      playlist: "core.playlist",
      slides: "core.slides",
      program: "core.program",
      side: "cuelith.mode-culto.songs",
    },
  },
  conferenza: {
    columns: ["22fr", "44fr", "22fr"],
    rows: ["50fr", "32fr"],
    areas: [
      ["playlist", "slides", "program"],
      ["playlist", "rundown", "program"],
    ],
    panels: {
      playlist: "core.playlist",
      slides: "core.slides",
      rundown: "cuelith.mode-conference.rundown",
      program: "core.program",
    },
  },
  concertoVj: {
    columns: ["70fr", "21fr"],
    rows: ["48fr", "16fr", "20fr"],
    areas: [
      ["clips", "program"],
      ["clips", "side"],
      ["timeline", "side"],
    ],
    panels: {
      clips: "cuelith.mode-vj.clips",
      program: "core.program",
      side: "core.outputs",
      timeline: "cuelith.mode-vj.timeline",
    },
  },
  broadcast: {
    columns: ["42fr", "6fr", "42fr"],
    rows: ["44fr", "38fr"],
    areas: [
      ["preview", "transition", "program"],
      ["bottom", "bottom", "bottom"],
    ],
    panels: {
      preview: "core.preview",
      transition: "cuelith.mode-broadcast.transition",
      program: "core.program",
      bottom: "cuelith.mode-broadcast.mixer",
    },
  },
  teatro: {
    columns: ["60fr", "31fr"],
    rows: ["22fr", "30fr", "30fr"],
    areas: [
      ["cues", "cues"],
      ["main", "program"],
      ["main", "side"],
    ],
    panels: {
      cues: "cuelith.mode-theatre.cuelist",
      main: "core.slides",
      program: "core.program",
      side: "core.outputs",
    },
  },
  signage: {
    columns: ["60fr", "31fr"],
    rows: ["42fr", "42fr"],
    areas: [
      ["schedule", "preview"],
      ["schedule", "side"],
    ],
    panels: {
      schedule: "cuelith.mode-signage.schedule",
      preview: "core.preview",
      side: "core.outputs",
    },
  },
};

function messages(layout: unknown): string[] {
  const result = LayoutSchema.safeParse(layout);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("LayoutSchema", () => {
  it("esprime la modalita' Presenta del nucleo", () => {
    expect(messages(presenta)).toEqual([]);
  });

  for (const [name, layout] of Object.entries(futureModes)) {
    it(`esprime la modalita' futura ${name}`, () => {
      expect(messages(layout)).toEqual([]);
    });
  }

  it("calcola i rettangoli delle aree", () => {
    expect(layoutAreaRects(presenta.areas)).toEqual({
      playlist: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 1 },
      slides: { rowStart: 0, rowEnd: 2, colStart: 1, colEnd: 2 },
      program: { rowStart: 0, rowEnd: 1, colStart: 2, colEnd: 3 },
      preview: { rowStart: 1, rowEnd: 2, colStart: 2, colEnd: 3 },
    });
  });

  it("rifiuta un'area a forma di L", () => {
    const layout = {
      ...presenta,
      areas: [
        ["playlist", "slides", "program"],
        ["playlist", "playlist", "preview"],
      ],
      panels: {
        playlist: "core.playlist",
        slides: "core.slides",
        program: "core.program",
        preview: "core.preview",
      },
    };
    expect(messages(layout)).toContain("protocol.layout.areaNotRectangular");
  });

  it("rifiuta un'area spezzata in due", () => {
    const layout = {
      columns: ["1fr", "1fr", "1fr"],
      rows: ["1fr"],
      areas: [["a", "b", "a"]],
      panels: { a: "core.slides", b: "core.program" },
    };
    expect(messages(layout)).toContain("protocol.layout.areaNotRectangular");
  });

  it("rifiuta righe e colonne che non combaciano", () => {
    expect(messages({ ...presenta, rows: ["1fr"] })).toContain("protocol.layout.rowsMismatch");
    expect(messages({ ...presenta, columns: ["1fr", "1fr"] })).toContain(
      "protocol.layout.columnsMismatch",
    );
  });

  it("rifiuta aree senza pannello e pannelli senza area", () => {
    const { preview: _preview, ...panels } = presenta.panels;
    expect(messages({ ...presenta, panels })).toContain("protocol.layout.panelMissing");
    expect(
      messages({ ...presenta, panels: { ...presenta.panels, extra: "core.outputs" } }),
    ).toContain("protocol.layout.areaUnused");
  });

  it("rifiuta dimensioni di traccia non valide", () => {
    expect(messages({ ...presenta, columns: ["22%", "40fr", "38fr"] })).toContain(
      "protocol.layout.trackInvalid",
    );
  });
});
