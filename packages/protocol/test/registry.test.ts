import { describe, expect, it } from "vitest";
import {
  HostToPanelSchema,
  PanelToHostSchema,
  RegistryIndexSchema,
  RegistryPluginSchema,
} from "../src/index.js";

export function registryEntry(id = "cuelith.songs") {
  return {
    id,
    name: "Canti",
    description: "Canti con strofe, ritornelli e ordine di proiezione.",
    publisher: "Cuelith",
    license: "Apache-2.0",
    repository: "https://github.com/Cuelith/plugin-songs",
    family: "function",
    verified: true,
    versions: [
      {
        version: "1.0.0",
        engines: { cuelith: "^0.1.0", protocol: "^1.4.0" },
        url: "https://github.com/Cuelith/plugin-songs/releases/download/v1.0.0/cuelith.songs-1.0.0.cpkg",
        sha256: "a".repeat(64),
        size: 12345,
        permissions: ["storage"],
        published: "2026-09-30T10:00:00.000Z",
      },
    ],
  };
}

describe("registry dei moduli", () => {
  it("accetta una voce valida", () => {
    expect(RegistryPluginSchema.safeParse(registryEntry()).success).toBe(true);
  });

  it("pacchetti solo in https e con impronta SHA-256 valida", () => {
    const entry = registryEntry();
    const version = entry.versions[0];
    if (version === undefined) throw new Error("versione mancante");
    expect(
      RegistryPluginSchema.safeParse({
        ...entry,
        versions: [{ ...version, url: "http://x.it/a.cpkg" }],
      }).success,
    ).toBe(false);
    expect(
      RegistryPluginSchema.safeParse({ ...entry, versions: [{ ...version, sha256: "abc" }] })
        .success,
    ).toBe(false);
  });

  it("l'indice rifiuta id ripetuti", () => {
    const result = RegistryIndexSchema.safeParse({
      schema: 1,
      generatedAt: "2026-09-30T10:00:00.000Z",
      plugins: [registryEntry(), registryEntry()],
    });
    expect(result.error?.issues.map((i) => i.message)).toContain("protocol.registry.duplicateId");
  });
});

describe("ponte dei pannelli", () => {
  it("valida i messaggi tra pannello e postazione", () => {
    expect(
      PanelToHostSchema.safeParse({ type: "call", id: 1, method: "item.create", params: {} })
        .success,
    ).toBe(true);
    expect(PanelToHostSchema.safeParse({ type: "eval", code: "x" }).success).toBe(false);
    expect(
      HostToPanelSchema.safeParse({
        type: "error",
        id: 1,
        error: { code: 4030, message: "core.error.forbidden" },
      }).success,
    ).toBe(true);
  });
});
