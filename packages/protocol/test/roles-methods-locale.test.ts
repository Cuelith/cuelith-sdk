import { describe, expect, it } from "vitest";
import {
  BUILTIN_ROLES,
  EngineMethods,
  pluginRole,
  PluginHostMethods,
  roleAllows,
  SCOPES,
  translate,
  type EngineMethodName,
} from "../src/index.js";

const allowed = (
  role: (typeof BUILTIN_ROLES)[keyof typeof BUILTIN_ROLES],
  name: EngineMethodName,
) => roleAllows(role, name, EngineMethods[name].scope);

describe("metodi", () => {
  it("hanno nomi area.verbo e un ambito esistente", () => {
    for (const [name, spec] of Object.entries({ ...EngineMethods, ...PluginHostMethods })) {
      expect(name).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
      expect(SCOPES).toContain(spec.scope);
    }
  });

  it("validano i parametri", () => {
    expect(
      EngineMethods["cue.goto"].params.safeParse({ entryId: "x", slideIndex: -1 }).success,
    ).toBe(false);
    expect(
      EngineMethods["session.pair"].params.safeParse({ code: "12345", name: "Tablet" }).success,
    ).toBe(false);
    expect(
      EngineMethods["session.pair"].params.safeParse({ code: "123456", name: "Tablet" }).success,
    ).toBe(true);
  });
});

describe("ruoli", () => {
  it("la regia puo' tutto tranne le azioni riservate ai moduli", () => {
    expect(allowed(BUILTIN_ROLES.director, "plugin.install")).toBe(true);
    expect(allowed(BUILTIN_ROLES.director, "pairing.start")).toBe(true);
    expect(allowed(BUILTIN_ROLES.director, "storage.set")).toBe(false);
  });

  it("il telecomando fa solo avanti e indietro", () => {
    expect(allowed(BUILTIN_ROLES.remote, "cue.next")).toBe(true);
    expect(allowed(BUILTIN_ROLES.remote, "cue.prev")).toBe(true);
    expect(allowed(BUILTIN_ROLES.remote, "cue.goto")).toBe(false);
    expect(allowed(BUILTIN_ROLES.remote, "output.blackout")).toBe(false);
  });

  it("il visualizzatore legge soltanto", () => {
    expect(allowed(BUILTIN_ROLES.viewer, "state.subscribe")).toBe(true);
    expect(allowed(BUILTIN_ROLES.viewer, "cue.next")).toBe(false);
  });

  it("l'operatore non installa moduli e non configura uscite", () => {
    expect(allowed(BUILTIN_ROLES.operator, "cue.take")).toBe(true);
    expect(allowed(BUILTIN_ROLES.operator, "output.blackout")).toBe(true);
    expect(allowed(BUILTIN_ROLES.operator, "plugin.install")).toBe(false);
    expect(allowed(BUILTIN_ROLES.operator, "output.create")).toBe(false);
  });

  it("librerie: operatore e regia le modificano, visualizzatore e telecomando le leggono soltanto", () => {
    expect(allowed(BUILTIN_ROLES.operator, "library.saveItem")).toBe(true);
    expect(allowed(BUILTIN_ROLES.director, "media.import")).toBe(true);
    expect(allowed(BUILTIN_ROLES.viewer, "library.items")).toBe(true);
    expect(allowed(BUILTIN_ROLES.viewer, "library.saveItem")).toBe(false);
    expect(allowed(BUILTIN_ROLES.remote, "library.create")).toBe(false);
  });

  it("un modulo usa il suo spazio ma non amministra", () => {
    const role = pluginRole("cuelith.bible");
    expect(roleAllows(role, "storage.set", EngineMethods["storage.set"].scope)).toBe(true);
    expect(roleAllows(role, "preview.set", EngineMethods["preview.set"].scope)).toBe(true);
    expect(roleAllows(role, "plugin.install", EngineMethods["plugin.install"].scope)).toBe(false);
    expect(roleAllows(role, "output.blackout", EngineMethods["output.blackout"].scope)).toBe(false);
  });
});

describe("translate", () => {
  const catalog = {
    "core.modules.count#one": "Nucleo + {count} modulo",
    "core.modules.count#other": "Nucleo + {count} moduli",
    "core.output.controlledBy": "L'uscita «{output}» è controllata da {role}",
  };

  it("sceglie il plurale giusto per l'italiano", () => {
    expect(translate(catalog, "it", "core.modules.count", { count: 1 })).toBe("Nucleo + 1 modulo");
    expect(translate(catalog, "it", "core.modules.count", { count: 3 })).toBe("Nucleo + 3 moduli");
  });

  it("sostituisce i segnaposto", () => {
    expect(
      translate(catalog, "it", "core.output.controlledBy", {
        output: "Diretta",
        role: "regia diretta",
      }),
    ).toBe("L'uscita «Diretta» è controllata da regia diretta");
  });

  it("restituisce la chiave se manca la traduzione", () => {
    expect(translate(catalog, "it", "core.mancante")).toBe("core.mancante");
  });
});
