import {
  emptyLayers,
  newId,
  type RichSession,
  type Span,
  type StateDocument,
} from "@cuelith/protocol";
import { describe, expect, it } from "vitest";
import { bindRichText, type Panel } from "../src/index.js";

function stateWith(richText?: RichSession): StateDocument {
  return {
    show: {
      schema: 1,
      id: newId(),
      name: "Show",
      playlist: [],
      items: {},
      sources: {},
      looks: {},
      scenes: {},
      outputs: {},
      rules: [],
      plugins: {},
    },
    live: {
      rev: 0,
      cursor: { slideIndex: 0 },
      preview: { slideIndex: 0 },
      layers: emptyLayers(),
      outputs: {},
      activeScene: {},
      clients: [],
      plugins: [],
      dirty: false,
      libraryRev: 0,
      ...(richText === undefined ? {} : { richText }),
    },
  };
}

/** Un pannello finto: tiene le chiamate e lascia mandare uno stato nuovo. */
function fakePanel(initial: StateDocument) {
  const calls: { method: string; params: unknown }[] = [];
  const listeners = new Set<(state: StateDocument) => void>();
  let current = initial;
  const panel = {
    pluginId: "acme.editor",
    get state() {
      return current;
    },
    call: (method: string, params: unknown) => {
      calls.push({ method, params });
      return Promise.resolve({ rev: 1 });
    },
    onState: (listener: (state: StateDocument) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as Panel;
  return {
    panel,
    calls,
    send(next: StateDocument) {
      current = next;
      for (const listener of listeners) listener(next);
    },
    listening: () => listeners.size,
  };
}

const session = (applied: number, spans?: Span[]): RichSession => ({
  owner: "acme.editor",
  field: "slide-1",
  text: "Il Signore",
  ...(spans === undefined ? {} : { spans }),
  selection: { start: 3, end: 10 },
  applied,
});

describe("parole formattate dal pannello di un plugin (protocollo 1.22)", () => {
  it("descrive il testo al motore e adotta le modifiche chieste da fuori", () => {
    const fake = fakePanel(stateWith());
    const adopted: Span[][] = [];
    const binding = bindRichText(fake.panel, "slide-1", (spans) => adopted.push(spans));
    binding.update({ text: "Il Signore", selection: { start: 3, end: 10 }, font: "lora" });
    expect(fake.calls).toEqual([
      {
        method: "richtext.session",
        params: {
          owner: "acme.editor",
          field: "slide-1",
          text: "Il Signore",
          selection: { start: 3, end: 10 },
          font: "lora",
        },
      },
    ]);
    // Nessuna modifica ancora: niente da adottare.
    fake.send(stateWith(session(0)));
    expect(adopted).toEqual([]);
    // Il plugin annesso chiede una modifica: arriva negli intervalli nuovi.
    fake.send(stateWith(session(1, [{ start: 3, end: 10, bold: true }])));
    expect(adopted).toEqual([[{ start: 3, end: 10, bold: true }]]);
    // Lo stesso stato non si adotta due volte.
    fake.send(stateWith(session(1, [{ start: 3, end: 10, bold: true }])));
    expect(adopted).toHaveLength(1);
  });

  it("ignora le sessioni degli altri testi e le modifiche gia' presenti all'apertura", () => {
    const fake = fakePanel(stateWith(session(4, [{ start: 0, end: 2, italic: true }])));
    const adopted: Span[][] = [];
    bindRichText(fake.panel, "slide-1", (spans) => adopted.push(spans));
    fake.send(stateWith(session(4, [{ start: 0, end: 2, italic: true }])));
    expect(adopted).toEqual([]);
    fake.send(stateWith({ ...session(9, [{ start: 0, end: 2, bold: true }]), field: "slide-2" }));
    expect(adopted).toEqual([]);
  });

  it("alla fine smette di ascoltare e lo dice al motore", () => {
    const fake = fakePanel(stateWith());
    const binding = bindRichText(fake.panel, "slide-1", () => undefined);
    expect(fake.listening()).toBe(1);
    binding.end();
    expect(fake.listening()).toBe(0);
    expect(fake.calls.at(-1)).toEqual({
      method: "richtext.end",
      params: { owner: "acme.editor", field: "slide-1" },
    });
    // Dopo la fine non si manda piu' niente.
    const count = fake.calls.length;
    binding.update({ text: "x", selection: { start: 0, end: 0 } });
    expect(fake.calls).toHaveLength(count);
  });
});
