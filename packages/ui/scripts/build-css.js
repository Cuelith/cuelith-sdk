// Genera dist/tokens.css dai token TypeScript compilati e copia i font nel
// pacchetto: postazione, uscite e pannelli dei moduli devono funzionare senza
// internet (mai font da Google Fonts).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tokensCss } from "../dist/tokens.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const fontsDir = join(dist, "fonts");
const filesDir = join(fontsDir, "files");
mkdirSync(filesDir, { recursive: true });

writeFileSync(join(dist, "tokens.css"), tokensCss());
copyFileSync(join(root, "src", "base.css"), join(dist, "base.css"));

const sources = [
  ["@fontsource-variable/fraunces", "opsz.css", "fraunces.css"],
  ["@fontsource-variable/fraunces", "opsz-italic.css", "fraunces-italic.css"],
  ["@fontsource-variable/schibsted-grotesk", "index.css", "schibsted-grotesk.css"],
  ["@fontsource-variable/jetbrains-mono", "index.css", "jetbrains-mono.css"],
];

const imports = [];
for (const [pkg, cssFile, outName] of sources) {
  const pkgDir = join(root, "node_modules", pkg);
  const css = readFileSync(join(pkgDir, cssFile), "utf8");
  const urls = [...css.matchAll(/url\(\.\/files\/([^)]+)\)/g)].map((m) => m[1]);
  if (urls.length === 0) throw new Error(`Nessun file di font trovato in ${pkg}/${cssFile}`);
  for (const file of urls) copyFileSync(join(pkgDir, "files", file), join(filesDir, file));
  writeFileSync(join(fontsDir, outName), css);
  imports.push(`@import "./fonts/${outName}";`);
}
writeFileSync(join(dist, "fonts.css"), `${imports.join("\n")}\n`);

// Unico file da includere per avere tutto: font, token, classi di base.
writeFileSync(
  join(dist, "cuelith-ui.css"),
  `@import "./fonts.css";\n@import "./tokens.css";\n@import "./base.css";\n`,
);
console.log(`ui: tokens.css, base.css, fonts.css (${imports.length} famiglie) in dist/`);
