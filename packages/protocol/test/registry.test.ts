import { generateKeyPairSync, sign, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  packageSignatureMessage,
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

const b64url = (data: Uint8Array) => Buffer.from(data).toString("base64url");
const keyPair = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return { publicKey, privateKey, authorKey: b64url(raw) };
};
const paidEntry = () => ({
  ...registryEntry("acme.lyrics-pro"),
  name: "Lyrics Pro",
  publisher: "Acme",
  verified: false,
  access: "paid" as const,
  price: "9 €",
  checkoutUrl: "https://acme.lemonsqueezy.com/checkout/buy/00000000-0000-0000-0000-000000000000",
  licensing: { provider: "lemonsqueezy" as const, storeId: 123, productId: 456 },
});
const messages = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((i) => i.message) ?? [];

describe("plugin a pagamento nel registry (decisione 0013)", () => {
  it("senza il campo access un plugin e' gratuito, e una voce vecchia resta valida", () => {
    const parsed = RegistryPluginSchema.parse(registryEntry());
    expect(parsed.access).toBe("free");
  });

  it("accetta un plugin a pagamento completo", () => {
    expect(RegistryPluginSchema.safeParse(paidEntry()).success).toBe(true);
  });

  it("a pagamento servono prezzo, pagina di acquisto e verifica della licenza", () => {
    const { price: _p, checkoutUrl: _c, licensing: _l, ...bare } = paidEntry();
    expect(messages(RegistryPluginSchema.safeParse(bare))).toEqual([
      "protocol.registry.paidNeedsPrice",
      "protocol.registry.paidNeedsCheckout",
      "protocol.registry.paidNeedsLicensing",
    ]);
  });

  it("un plugin gratuito non porta prezzo, acquisto o licenza", () => {
    const { access: _a, ...rest } = paidEntry();
    expect(messages(RegistryPluginSchema.safeParse(rest))).toEqual([
      "protocol.registry.freeHasPrice",
      "protocol.registry.freeHasCheckout",
      "protocol.registry.freeHasLicensing",
    ]);
  });

  it("la pagina di acquisto e' solo di un negozio ammesso, in https", () => {
    const entry = paidEntry();
    for (const checkoutUrl of [
      "https://evil.example/checkout",
      "https://lemonsqueezy.com.evil.example/buy/x",
      "http://acme.lemonsqueezy.com/buy/x",
      "https://user:pw@acme.lemonsqueezy.com/buy/x",
      "https://lemonsqueezyXcom/buy/x",
      "https://acme.lemonsqueezyXcom/buy/x",
    ]) {
      expect(RegistryPluginSchema.safeParse({ ...entry, checkoutUrl }).success).toBe(false);
    }
    expect(
      RegistryPluginSchema.safeParse({ ...entry, checkoutUrl: "https://lemonsqueezy.com/buy/x" })
        .success,
    ).toBe(true);
  });

  it("il fornitore delle licenze e i suoi numeri sono controllati", () => {
    const entry = paidEntry();
    for (const licensing of [
      { ...entry.licensing, provider: "paddle" },
      { ...entry.licensing, storeId: 0 },
      { ...entry.licensing, productId: 1.5 },
      { provider: "lemonsqueezy", storeId: 1, productId: 2, apiUrl: "https://x.it" },
    ]) {
      expect(RegistryPluginSchema.safeParse({ ...entry, licensing }).success).toBe(false);
    }
  });

  it("con la chiave dell'autore ogni versione e' firmata, e la firma si verifica", () => {
    const { publicKey, privateKey, authorKey } = keyPair();
    const entry = paidEntry();
    const version = entry.versions[0];
    if (version === undefined) throw new Error("versione mancante");
    const unsigned = { ...entry, authorKey };
    expect(messages(RegistryPluginSchema.safeParse(unsigned))).toEqual([
      "protocol.registry.signatureRequired",
    ]);

    const text = packageSignatureMessage(entry.id, version.version, version.sha256);
    const signature = b64url(sign(null, Buffer.from(text), privateKey));
    const signed = { ...unsigned, versions: [{ ...version, signature }] };
    expect(RegistryPluginSchema.safeParse(signed).success).toBe(true);
    expect(verify(null, Buffer.from(text), publicKey, Buffer.from(signature, "base64url"))).toBe(
      true,
    );

    // La firma non vale per un altro pacchetto ne' per un'altra versione.
    for (const other of [
      packageSignatureMessage(entry.id, "1.0.1", version.sha256),
      packageSignatureMessage(entry.id, version.version, "b".repeat(64)),
      packageSignatureMessage("acme.other", version.version, version.sha256),
    ]) {
      expect(verify(null, Buffer.from(other), publicKey, Buffer.from(signature, "base64url"))).toBe(
        false,
      );
    }
  });

  it("chiave e firma hanno il formato giusto (base64url, 32 e 64 byte)", () => {
    const entry = paidEntry();
    for (const authorKey of ["", "abc", "!".repeat(43), "A".repeat(44)]) {
      expect(RegistryPluginSchema.safeParse({ ...entry, authorKey }).success).toBe(false);
    }
    const version = entry.versions[0];
    if (version === undefined) throw new Error("versione mancante");
    expect(
      RegistryPluginSchema.safeParse({ ...entry, versions: [{ ...version, signature: "abc" }] })
        .success,
    ).toBe(false);
  });

  it("l'indice 2 accetta plugin a pagamento; l'indice 1 resta valido", () => {
    for (const schema of [1, 2]) {
      expect(
        RegistryIndexSchema.safeParse({
          schema,
          generatedAt: "2026-10-05T10:00:00.000Z",
          plugins: [registryEntry(), ...(schema === 2 ? [paidEntry()] : [])],
        }).success,
      ).toBe(true);
    }
    expect(
      RegistryIndexSchema.safeParse({
        schema: 3,
        generatedAt: "2026-10-05T10:00:00.000Z",
        plugins: [],
      }).success,
    ).toBe(false);
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
