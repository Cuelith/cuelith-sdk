import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LICENSE_MAX_DEVICES_PER_KEY,
  licenseProofMessage,
  LicenseStatusSchema,
  NOTARY_PUBLIC_KEYS,
  verifyLicenseProof,
  verifyLicenseToken,
} from "../src/index.js";

// Permesso di licenza e prova di possesso (decisione 0013): si costruiscono qui
// come fa il Notaio e si verificano con le funzioni del protocollo.

const b64u = (data: Uint8Array | string) => Buffer.from(data).toString("base64url");
const pair = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    publicKey: b64u(publicKey.export({ format: "der", type: "spki" }).subarray(-32)),
  };
};
const notary = pair();
const device = pair();
const other = pair();
const NOW = Date.UTC(2026, 9, 6);
const keys = { n1: notary.publicKey };

function token(over: Record<string, unknown> = {}, signer = notary, kid = "n1") {
  const payload = {
    v: 1,
    kid,
    plugin: "acme.lyrics-pro",
    device: device.publicKey,
    instance: "inst-0001-aaaa",
    iat: NOW / 1000,
    renewAfter: NOW / 1000 + 30 * 86400,
    exp: NOW / 1000 + 90 * 86400,
    ...over,
  };
  const body = b64u(JSON.stringify(payload));
  const signature = b64u(sign(null, Buffer.from(`cuelith-license-v1\n${body}`), signer.privateKey));
  return { body, signature, text: `${body}.${signature}` };
}

describe("permesso di licenza", () => {
  it("il permesso del Notaio si verifica, con plugin e computer attesi", async () => {
    const payload = await verifyLicenseToken(token().text, {
      keys,
      pluginId: "acme.lyrics-pro",
      devicePublicKey: device.publicKey,
      now: NOW,
    });
    expect(payload?.instance).toBe("inst-0001-aaaa");
    expect(payload?.exp).toBe(NOW / 1000 + 90 * 86400);
  });

  it("rifiuta firma di un altro, contenuto alterato, kid sconosciuto, forma strana", async () => {
    const options = { keys, now: NOW };
    expect(await verifyLicenseToken(token({}, other).text, options)).toBeUndefined();
    const good = token();
    const altered = {
      ...(JSON.parse(Buffer.from(good.body, "base64url").toString()) as Record<string, unknown>),
      plugin: "acme.altro",
    };
    expect(
      await verifyLicenseToken(`${b64u(JSON.stringify(altered))}.${good.signature}`, options),
    ).toBeUndefined();
    expect(await verifyLicenseToken(token({}, notary, "n9").text, options)).toBeUndefined();
    expect(await verifyLicenseToken(token({ v: 2 }).text, options)).toBeUndefined();
    expect(await verifyLicenseToken(token({ extra: 1 }).text, options)).toBeUndefined();
    for (const bad of ["", "a", "a.b.c", "x.y", `${good.body}.`, `.${good.signature}`]) {
      expect(await verifyLicenseToken(bad, options)).toBeUndefined();
    }
  });

  it("non vale per un altro plugin, per un altro computer, o dopo la scadenza", async () => {
    const good = token().text;
    expect(
      await verifyLicenseToken(good, { keys, pluginId: "acme.altro", now: NOW }),
    ).toBeUndefined();
    expect(
      await verifyLicenseToken(good, { keys, devicePublicKey: other.publicKey, now: NOW }),
    ).toBeUndefined();
    expect(await verifyLicenseToken(good, { keys, now: NOW + 89 * 86400_000 })).toBeDefined();
    expect(await verifyLicenseToken(good, { keys, now: NOW + 91 * 86400_000 })).toBeUndefined();
  });

  it("usa le chiavi del progetto se non se ne passano altre", async () => {
    expect(NOTARY_PUBLIC_KEYS.n1).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Un permesso firmato da una chiave che non e' quella del progetto non passa.
    expect(await verifyLicenseToken(token().text, { now: NOW })).toBeUndefined();
  });

  it("i posti per chiave sono 3 (la stessa regola del Notaio)", () => {
    expect(LICENSE_MAX_DEVICES_PER_KEY).toBe(3);
  });
});

describe("prova di possesso per il plugin", () => {
  const nonce = "n".repeat(32);
  const proofFor = (text: string, who = device, pluginId = "acme.lyrics-pro", sfida = nonce) => ({
    token: text,
    signature: b64u(sign(null, Buffer.from(licenseProofMessage(pluginId, sfida)), who.privateKey)),
  });
  const options = { keys, pluginId: "acme.lyrics-pro", nonce, now: NOW };

  it("permesso valido e firma del computer giusto sulla sfida", async () => {
    const payload = await verifyLicenseProof(proofFor(token().text), options);
    expect(payload?.plugin).toBe("acme.lyrics-pro");
  });

  it("senza il computer giusto, con una sfida diversa o per un altro plugin non passa", async () => {
    // Permesso valido ma firma di un altro computer: chi copia il permesso non basta.
    expect(await verifyLicenseProof(proofFor(token().text, other), options)).toBeUndefined();
    // Una risposta registrata per un'altra sfida non si riusa.
    expect(
      await verifyLicenseProof(
        proofFor(token().text, device, "acme.lyrics-pro", "x".repeat(32)),
        options,
      ),
    ).toBeUndefined();
    expect(
      await verifyLicenseProof(proofFor(token().text, device, "acme.altro"), options),
    ).toBeUndefined();
    // Permesso di un altro plugin.
    expect(
      await verifyLicenseProof(proofFor(token({ plugin: "acme.altro" }).text), options),
    ).toBeUndefined();
    // Firma malformata.
    expect(
      await verifyLicenseProof({ token: token().text, signature: "A".repeat(86) }, options),
    ).toBeUndefined();
  });
});

describe("stato della licenza", () => {
  it("forma valida e rifiuto dei campi sconosciuti", () => {
    const ok = {
      pluginId: "acme.lyrics-pro",
      state: "active",
      expires: "2026-12-01T00:00:00.000Z",
    };
    expect(LicenseStatusSchema.safeParse(ok).success).toBe(true);
    expect(LicenseStatusSchema.safeParse({ ...ok, state: "boh" }).success).toBe(false);
    expect(LicenseStatusSchema.safeParse({ ...ok, licenseKey: "segreta" }).success).toBe(false);
  });
});

// Se il sito e' affiancato (come in locale), il Notaio vero produce permessi che questo codice accetta.
const NOTARY_FILE = new URL("../../../../cuelith-site/functions/_lib/notary.js", import.meta.url);
describe.skipIf(!existsSync(NOTARY_FILE))("compatibilita' con il Notaio del sito", () => {
  it("un permesso firmato dal Notaio vero si verifica con le funzioni del protocollo", async () => {
    const site = (await import(NOTARY_FILE.href)) as {
      signLicense: (
        input: Record<string, unknown>,
        env: Record<string, string>,
        now: number,
      ) => Promise<{ token: string }>;
    };
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const env = {
      NOTARY_PRIVATE_KEY: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
      NOTARY_KEY_ID: "n1",
    };
    const result = await site.signLicense(
      {
        pluginId: "acme.lyrics-pro",
        devicePublicKey: device.publicKey,
        instanceId: "inst-0001-aaaa",
        test: false,
      },
      env,
      NOW,
    );
    const payload = await verifyLicenseToken(result.token, {
      keys: { n1: b64u(publicKey.export({ format: "der", type: "spki" }).subarray(-32)) },
      pluginId: "acme.lyrics-pro",
      devicePublicKey: device.publicKey,
      now: NOW,
    });
    expect(payload?.renewAfter).toBe(NOW / 1000 + 30 * 86400);
    expect(createHash("sha256").update(result.token).digest("hex")).toHaveLength(64);
  });
});
