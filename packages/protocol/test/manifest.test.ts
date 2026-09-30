import { describe, expect, it } from "vitest";
import { isActivePlugin, PluginManifestSchema, type PluginManifest } from "../src/index.js";
import { bibleManifest, italianManifest } from "./fixtures.js";

function messages(manifest: unknown): string[] {
  const result = PluginManifestSchema.safeParse(manifest);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

const layout = (panels: Record<string, string>) => ({
  columns: ["1fr", "1fr"],
  rows: ["1fr"],
  areas: [["a", "b"]],
  panels,
});

describe("PluginManifestSchema", () => {
  it("accetta il manifest del modulo Bibbia del documento", () => {
    expect(messages(bibleManifest())).toEqual([]);
  });

  it("accetta la lingua italiana come modulo di soli dati", () => {
    expect(messages(italianManifest())).toEqual([]);
  });

  it("rifiuta una lingua con un processo", () => {
    const m: PluginManifest = { ...italianManifest(), runtime: { type: "node", entry: "main.js" } };
    expect(messages(m)).toContain("protocol.manifest.localeNeedsNoRuntime");
  });

  it("rifiuta una lingua senza cataloghi", () => {
    const m: PluginManifest = { ...italianManifest(), contributes: {} };
    expect(messages(m)).toContain("protocol.manifest.localeNeedsLocales");
  });

  it("rifiuta comandi in un modulo senza processo", () => {
    const m: PluginManifest = {
      ...italianManifest(),
      family: "function",
      contributes: { commands: [{ id: "go", title: "cuelith.locale.it.command.go" }] },
    };
    expect(messages(m)).toContain("protocol.manifest.commandsNeedRuntime");
  });

  it("rifiuta pannelli senza interfaccia", () => {
    const { ui: _ui, ...rest } = bibleManifest();
    expect(messages(rest)).toContain("protocol.manifest.panelsNeedUi");
  });

  it("rifiuta chiavi di traduzione fuori dallo spazio del modulo", () => {
    const m = bibleManifest();
    m.contributes.panels = [{ id: "search", title: "core.playlist.title" }];
    expect(messages(m)).toContain("protocol.manifest.keyOutsideNamespace");
  });

  it("rifiuta percorsi che escono dalla cartella del modulo", () => {
    const m: PluginManifest = {
      ...bibleManifest(),
      runtime: { type: "node", entry: "../fuori.js" },
    };
    expect(messages(m)).toContain("protocol.manifest.pathOutside");
  });

  it("rifiuta permessi sconosciuti", () => {
    const m = { ...bibleManifest(), permissions: ["root"] };
    expect(messages(m)).toContain("protocol.manifest.permissionInvalid");
  });

  it("rifiuta id duplicati tra i contributi", () => {
    const m = bibleManifest();
    m.contributes.commands = [
      { id: "goto", title: "cuelith.bible.command.goto" },
      { id: "goto", title: "cuelith.bible.command.goto2" },
    ];
    expect(messages(m)).toContain("protocol.manifest.duplicateId");
  });

  it("accetta una modalita' con pannelli del nucleo e propri", () => {
    const m = bibleManifest();
    m.contributes.modes = [
      {
        id: "study",
        title: "cuelith.bible.mode.study",
        layout: layout({ a: "core.slides", b: "cuelith.bible.search" }),
      },
    ];
    expect(messages(m)).toEqual([]);
  });

  it("rifiuta una modalita' con un pannello proprio non dichiarato", () => {
    const m = bibleManifest();
    m.contributes.modes = [
      {
        id: "study",
        title: "cuelith.bible.mode.study",
        layout: layout({ a: "core.slides", b: "cuelith.bible.missing" }),
      },
    ];
    expect(messages(m)).toContain("protocol.manifest.panelNotDeclared");
  });

  it("rifiuta una modalita' con pannelli di moduli non dipendenti o del nucleo inesistenti", () => {
    const m = bibleManifest();
    m.contributes.modes = [
      {
        id: "a",
        title: "cuelith.bible.mode.a",
        layout: layout({ a: "core.slides", b: "cuelith.timer.clock" }),
      },
      {
        id: "b",
        title: "cuelith.bible.mode.b",
        layout: layout({ a: "core.nothing", b: "cuelith.bible.search" }),
      },
    ];
    const found = messages(m).filter((x) => x === "protocol.manifest.panelNotAvailable");
    expect(found).toHaveLength(2);
  });

  it("accetta pannelli dei moduli da cui dipende", () => {
    const m = bibleManifest();
    m.dependencies = { "cuelith.timer": "^1.0.0" };
    m.contributes.modes = [
      {
        id: "a",
        title: "cuelith.bible.mode.a",
        layout: layout({ a: "cuelith.timer.clock", b: "cuelith.bible.search" }),
      },
    ];
    expect(messages(m)).toEqual([]);
  });
});

describe("guida al primo uso e documentazione (protocollo 1.4)", () => {
  it("accetta passi con chiavi del modulo e un indirizzo https", () => {
    const m = {
      ...bibleManifest(),
      docs: { url: "https://github.com/Cuelith/plugin-bible#readme" },
      onboarding: [{ title: "cuelith.bible.tour.1.title", body: "cuelith.bible.tour.1.body" }],
    };
    expect(PluginManifestSchema.safeParse(m).success).toBe(true);
  });

  it("rifiuta testi fuori dallo spazio del modulo e documentazione non https", () => {
    const m = {
      ...bibleManifest(),
      docs: { url: "http://esempio.it" },
      onboarding: [{ title: "core.mode.present", body: "cuelith.bible.tour.1.body" }],
    };
    const result = PluginManifestSchema.safeParse(m);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain(
      "protocol.manifest.keyOutsideNamespace",
    );
  });
});

describe("icona e moduli attivi (protocollo 1.6)", () => {
  it("l'icona e' un file SVG del pacchetto", () => {
    expect(PluginManifestSchema.safeParse({ ...bibleManifest(), icon: "icon.svg" }).success).toBe(
      true,
    );
    expect(messages({ ...bibleManifest(), icon: "icon.png" })).toContain(
      "protocol.manifest.iconSvg",
    );
    expect(PluginManifestSchema.safeParse({ ...bibleManifest(), icon: "../x.svg" }).success).toBe(
      false,
    );
  });

  it("attivo = ha uno strumento nella colonna di sinistra; le lingue sono passive", () => {
    expect(isActivePlugin(bibleManifest())).toBe(true);
    expect(isActivePlugin(italianManifest())).toBe(false);
    expect(
      isActivePlugin({
        contributes: { panels: [{ id: "editor", title: "a.b", placement: "center" }] },
      }),
    ).toBe(false);
  });
});
