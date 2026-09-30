// Linguaggio visivo di Cuelith (documento di progetto, cap. 17): un codice
// colore valido in ogni modalita'. Unica fonte: da qui si genera tokens.css
// per postazione e pannelli dei moduli, e il renderer delle uscite legge gli
// stessi valori per disegnare in WebGL.

export const colors = {
  bg: "#0B0C0E",
  bg2: "#121417",
  bg3: "#181B1F",
  line: "#262A31",
  line2: "#333840",
  fg: "#ECEAE4",
  muted: "#A9ADB4",
  faint: "#7C818A",
  /** In onda: programma, tally. */
  live: "#FF5B3A",
  liveBg: "#2A1712",
  liveSoft: "#FF8A6E",
  liveInk: "#1A0703",
  /** Prossimo: anteprima, cue. */
  cue: "#37D1BF",
  cueBg: "#10201E",
  cueSoft: "#BFD8D5",
  cueInk: "#06201D",
  /** Palco e avvisi: stage, ritardi. */
  stage: "#F2B441",
  stageBg: "#241E0E",
  stageLine: "#5A4618",
  /** Moduli installati. */
  mod: "#C9BFFF",
  modBg: "#16142A",
  modChip: "#26224A",
  modLine: "#4A4470",
  blue: "#8FB8FF",
  blueBg: "#121B2A",
  pink: "#E8A0C8",
  /** Fondo dei riquadri che simulano uno schermo in onda. */
  screenLive: "#17120E",
  screen: "#050607",
} as const;

export type ColorToken = keyof typeof colors;

export const fonts = {
  /** Testi sullo schermo e titoli. */
  display: "'Fraunces Variable', Georgia, 'Times New Roman', serif",
  /** Interfaccia di regia. */
  body: "'Schibsted Grotesk Variable', 'Helvetica Neue', Arial, sans-serif",
  /** Timecode e orari. */
  mono: "'JetBrains Mono Variable', ui-monospace, Menlo, Consolas, monospace",
} as const;

export type FontToken = keyof typeof fonts;

/** Nome della variabile CSS di un token: bg2 -> --cl-bg-2, liveBg -> --cl-live-bg. */
export function cssVar(token: string): string {
  return `--cl-${token
    .replace(/([A-Z])/g, "-$1")
    .replace(/(\d+)/g, "-$1")
    .toLowerCase()}`;
}

/** Colore esadecimale "#RRGGBB" come numero, per le API WebGL. */
export function hexToNumber(hex: string): number {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) throw new Error(`Colore non valido: ${hex}`);
  return Number.parseInt(hex.slice(1), 16);
}

export function tokensCss(): string {
  const lines = [
    ...Object.entries(colors).map(([k, v]) => `  ${cssVar(k)}: ${v};`),
    ...Object.entries(fonts).map(([k, v]) => `  ${cssVar(k)}: ${v};`),
  ];
  return `:root {\n${lines.join("\n")}\n  color-scheme: dark;\n}\n`;
}
