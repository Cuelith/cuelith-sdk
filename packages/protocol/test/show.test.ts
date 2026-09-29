import { describe, expect, it } from "vitest";
import { newId, ShowSchema, type Show } from "../src/index.js";
import { makeShow } from "./fixtures.js";

function messages(show: unknown): string[] {
  const result = ShowSchema.safeParse(show);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

const firstKey = (record: Record<string, unknown>): string => {
  const key = Object.keys(record)[0];
  if (key === undefined) throw new Error("record vuoto");
  return key;
};

describe("ShowSchema", () => {
  it("accetta uno show valido", () => {
    expect(messages(makeShow())).toEqual([]);
  });

  it("rifiuta un file con un campo sconosciuto", () => {
    expect(messages({ ...makeShow(), extra: true })).not.toEqual([]);
  });

  it("rifiuta una voce di scaletta che punta a un elemento inesistente", () => {
    const show = makeShow();
    show.playlist.push({ id: newId(), itemId: newId() });
    expect(messages(show)).toContain("protocol.show.itemMissing");
  });

  it("rifiuta una chiave del record diversa dall'id dell'oggetto", () => {
    const show = makeShow();
    const key = firstKey(show.items);
    const item = show.items[key];
    if (item === undefined) throw new Error("fixture");
    show.items = { [key]: { ...item, id: newId() } };
    expect(messages(show)).toContain("protocol.show.keyMismatch");
  });

  it("rifiuta un arrangiamento con un gruppo che nessuna slide ha", () => {
    const show = makeShow();
    const item = show.items[firstKey(show.items)];
    if (item === undefined) throw new Error("fixture");
    item.arrangement = ["S1", "PONTE"];
    expect(messages(show)).toContain("protocol.show.groupMissing");
  });

  it("rifiuta specchi in ciclo", () => {
    const show = makeShow();
    const [a, b] = Object.keys(show.outputs);
    if (a === undefined || b === undefined) throw new Error("fixture");
    const oa = show.outputs[a];
    const ob = show.outputs[b];
    if (oa === undefined || ob === undefined) throw new Error("fixture");
    oa.feed = { type: "mirror", outputId: b };
    ob.feed = { type: "mirror", outputId: a };
    expect(messages(show)).toContain("protocol.show.mirrorCycle");
  });

  it("rifiuta un look applicato a una sorgente di tipo diverso", () => {
    const show = makeShow();
    const media = newId();
    show.sources[media] = { id: media, type: "core.media", provider: "core", params: {} };
    const output = show.outputs[firstKey(show.outputs)];
    if (output === undefined || output.feed.type !== "source") throw new Error("fixture");
    output.feed = { type: "source", sourceId: media, lookId: output.feed.lookId };
    expect(messages(show)).toContain("protocol.show.lookSourceMismatch");
  });

  it("richiede che i tipi dei moduli siano dichiarati in plugins", () => {
    const show: Show = makeShow();
    const id = newId();
    show.items[id] = { id, type: "cuelith.bible.passage", title: "Gv 3:16", slides: [], meta: {} };
    expect(messages(show)).toContain("protocol.show.pluginNotDeclared");
    show.plugins["cuelith.bible"] = "^1.0.0";
    expect(messages(show)).toEqual([]);
  });

  it("rifiuta un fornitore di sorgente incoerente col tipo", () => {
    const show = makeShow();
    const source = show.sources[firstKey(show.sources)];
    if (source === undefined) throw new Error("fixture");
    source.provider = "cuelith.capture";
    expect(messages(show)).toContain("protocol.show.providerMismatch");
  });

  it("rifiuta coordinate di scena fuori da 0..1", () => {
    const show = makeShow();
    const scene = newId();
    show.scenes[scene] = {
      id: scene,
      name: "Camera + testo",
      elements: [
        {
          id: newId(),
          sourceId: firstKey(show.sources),
          rect: { x: 0, y: 0, w: 1.5, h: 1 },
          opacity: 1,
          z: 0,
          visible: true,
        },
      ],
    };
    expect(messages(show)).not.toEqual([]);
  });
});
