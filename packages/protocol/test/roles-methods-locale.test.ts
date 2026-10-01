import { describe, expect, it } from "vitest";
import {
  BUILTIN_ROLES,
  formatTimer,
  timerPhase,
  timerRemaining,
  TimerSchema,
  CursorSchema,
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

describe("elementi fuori scaletta (protocollo 1.5)", () => {
  const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

  it("una posizione e' una voce della scaletta oppure un elemento diretto, non tutti e due", () => {
    const goto = EngineMethods["cue.goto"].params;
    expect(goto.safeParse({ entryId: id, slideIndex: 0 }).success).toBe(true);
    expect(goto.safeParse({ itemId: id, slideIndex: 2 }).success).toBe(true);
    expect(goto.safeParse({ entryId: id, itemId: id, slideIndex: 0 }).success).toBe(false);
    expect(CursorSchema.safeParse({ entryId: id, itemId: id, slideIndex: 0 }).success).toBe(false);
    expect(CursorSchema.safeParse({ itemId: id, slideIndex: 0 }).success).toBe(true);
  });

  it("cue.send manda un elemento della libreria in anteprima o in onda", () => {
    const send = EngineMethods["cue.send"];
    expect(send.scope).toBe("cue");
    expect(send.params.safeParse({ libraryItemId: id, to: "program" }).success).toBe(true);
    expect(send.params.safeParse({ libraryItemId: id, to: "altrove" }).success).toBe(false);
    // I moduli (es. Canti) possono usarlo: rientra nella regia.
    expect(roleAllows(pluginRole("cuelith.songs"), "cue.send", send.scope)).toBe(true);
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

describe("librerie organizzate (protocollo 1.3)", () => {
  it("la sigla e' fatta di lettere e cifre maiuscole", () => {
    const params = EngineMethods["library.create"].params;
    expect(params.safeParse({ name: "Innario", code: "INN" }).success).toBe(true);
    expect(params.safeParse({ name: "Innario", code: "RdA" }).success).toBe(false);
    expect(params.safeParse({ name: "Innario", code: "TROPPOLUNGA" }).success).toBe(false);
  });

  it("categoria e preferita si possono cambiare e togliere", () => {
    const params = EngineMethods["library.update"].params;
    expect(
      params.safeParse({ id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", category: null, favorite: true })
        .success,
    ).toBe(true);
  });
});

describe("timer e messaggi al palco (protocollo 1.7)", () => {
  it("il timer conta dalla partenza; fermo tiene il rimanente", () => {
    const start = Date.parse("2026-10-01T10:00:00Z");
    const running = {
      durationMs: 600_000,
      remainingMs: 600_000,
      startedAt: new Date(start).toISOString(),
    };
    expect(timerRemaining(running, start + 90_000)).toBe(510_000);
    expect(timerRemaining({ durationMs: 600_000, remainingMs: 42_000 }, start)).toBe(42_000);
    expect(TimerSchema.safeParse(running).success).toBe(true);
  });

  it("colori del tempo: verde, ambra sotto 2 minuti, rosso sotto 30 secondi e oltre", () => {
    expect(timerPhase(121_000)).toBe("ok");
    expect(timerPhase(120_000)).toBe("warning");
    expect(timerPhase(30_000)).toBe("danger");
    expect(timerPhase(-5_000)).toBe("danger");
  });

  it("formato: minuti:secondi, ore se servono, meno oltre il tempo", () => {
    expect(formatTimer(760_000)).toBe("12:40");
    expect(formatTimer(3_900_000)).toBe("1:05:00");
    expect(formatTimer(-42_000)).toBe("-0:42");
    expect(formatTimer(0)).toBe("0:00");
    expect(formatTimer(400)).toBe("0:01");
  });

  it("i comandi stanno nella regia, anche per i moduli", () => {
    for (const name of [
      "timer.set",
      "timer.start",
      "timer.pause",
      "timer.reset",
      "message.send",
    ] as const) {
      expect(EngineMethods[name].scope).toBe("cue");
    }
  });
});
