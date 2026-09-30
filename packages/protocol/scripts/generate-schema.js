// Genera i JSON Schema pubblici da schemi zod del protocollo compilato.
// Vanno rigenerati e committati a ogni modifica del modello (cap. 18).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  LayoutSchema,
  PluginManifestSchema,
  RegistryPluginSchema,
  ShowSchema,
} from "../dist/index.js";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "schema");
mkdirSync(outDir, { recursive: true });

const BASE = "https://cuelith.github.io/cuelith-sdk/schema";
const targets = [
  ["show-1.json", ShowSchema, "Show di Cuelith (file .cuelith, schema 1)"],
  ["plugin-1.json", PluginManifestSchema, "Manifest di un modulo di Cuelith (cuelith-plugin.json)"],
  ["layout-1.json", LayoutSchema, "Layout di una modalita' di Cuelith"],
  [
    "registry-plugin-1.json",
    RegistryPluginSchema,
    "Voce del registry dei moduli di Cuelith (plugins/<id>.json)",
  ],
];

for (const [file, schema, title] of targets) {
  const json = z.toJSONSchema(schema, { unrepresentable: "any", io: "input" });
  const document = { $id: `${BASE}/${file}`, title, ...json };
  writeFileSync(join(outDir, file), `${JSON.stringify(document, null, 2)}\n`);
  console.log(`scritto schema/${file}`);
}
