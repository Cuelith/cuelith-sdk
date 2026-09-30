import { newId, type PluginManifest, type Show } from "../src/index.js";

/** Show minimo valido: presentazione, look Sala e Palco, un elemento di testo, due uscite. */
export function makeShow(): Show {
  const presentation = newId();
  const sala = newId();
  const palco = newId();
  const item = newId();
  const room = newId();
  const stage = newId();
  const entry = newId();
  return {
    schema: 1,
    id: newId(),
    name: "Culto di domenica",
    playlist: [{ id: entry, itemId: item }],
    items: {
      [item]: {
        id: item,
        type: "core.text",
        title: "Luce del mattino",
        slides: [
          {
            id: newId(),
            group: "S1",
            fields: { text: { kind: "text", value: "Luce del mattino, vieni su di noi" } },
          },
          {
            id: newId(),
            group: "RIT",
            fields: { text: { kind: "text", value: "Riempi questo luogo" } },
          },
        ],
        arrangement: ["S1", "RIT"],
        meta: {},
      },
    },
    sources: {
      [presentation]: { id: presentation, type: "core.presentation", provider: "core", params: {} },
    },
    looks: {
      [sala]: {
        id: sala,
        name: "Sala",
        sourceType: "core.presentation",
        fields: ["text"],
        layers: ["background", "content", "message", "logo"],
        template: "core.fullscreen",
        style: {},
      },
      [palco]: {
        id: palco,
        name: "Palco",
        sourceType: "core.presentation",
        fields: ["text", "chords"],
        layers: ["content", "message"],
        template: "core.stage",
        style: {},
      },
    },
    scenes: {},
    outputs: {
      [room]: {
        id: room,
        name: "Proiettore",
        kind: "display",
        provider: "core",
        target: { displayId: "2", mode: "fullscreen" },
        format: { width: 1920, height: 1080, fps: 60 },
        feed: { type: "source", sourceId: presentation, lookId: sala },
      },
      [stage]: {
        id: stage,
        name: "Monitor palco",
        kind: "display",
        provider: "core",
        target: { displayId: "3", mode: "fullscreen" },
        format: { width: 1920, height: 1080, fps: 60 },
        feed: { type: "source", sourceId: presentation, lookId: palco },
      },
    },
    rules: [],
    plugins: {},
  };
}

/** Manifest del modulo Bibbia del documento (cap. 24), coi nomi di Cuelith. */
export function bibleManifest(): PluginManifest {
  return {
    $schema: "https://cuelith.github.io/cuelith-sdk/schema/plugin-1.json",
    id: "cuelith.bible",
    name: "Bibbia multi-versione",
    version: "1.4.0",
    publisher: "Cuelith",
    license: "Apache-2.0",
    repository: "https://github.com/Cuelith/plugin-bible",
    family: "function",
    engines: { cuelith: "^1.0.0", protocol: "^1.0.0" },
    runtime: { type: "node", entry: "dist/main.js" },
    ui: { entry: "dist/ui/index.html" },
    permissions: ["storage", "network:api.example.org"],
    dependencies: {},
    extends: [],
    provides: [],
    contributes: {
      panels: [{ id: "search", title: "cuelith.bible.panel.search", icon: "book" }],
      itemTypes: [{ id: "passage", title: "cuelith.bible.itemType.passage" }],
      commands: [{ id: "goto", title: "cuelith.bible.command.goto" }],
      events: ["passageShown"],
      settings: [
        {
          key: "defaultTranslation",
          title: "cuelith.bible.setting.defaultTranslation",
          type: "string",
        },
      ],
      extensionPoints: [{ id: "translations", schema: "schemas/translation.json" }],
    },
  };
}

export function italianManifest(): PluginManifest {
  return {
    id: "cuelith.locale.it",
    name: "Italiano",
    version: "0.1.0",
    publisher: "Cuelith",
    license: "Apache-2.0",
    repository: "https://github.com/Cuelith/plugin-locale-it",
    family: "locale",
    engines: { cuelith: "^0.1.0", protocol: "^1.0.0" },
    runtime: { type: "none" },
    permissions: [],
    dependencies: {},
    extends: [],
    provides: [],
    contributes: { locales: [{ lang: "it", file: "locales/it.json", name: "Italiano" }] },
  };
}
