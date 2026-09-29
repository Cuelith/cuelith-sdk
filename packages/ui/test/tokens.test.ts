import { describe, expect, it } from "vitest";
import { colors, cssVar, fonts, hexToNumber, tokensCss } from "../src/index.js";

describe("token", () => {
  it("ogni colore e' un esadecimale a 6 cifre", () => {
    for (const value of Object.values(colors)) expect(value).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("i colori semantici sono quelli del documento", () => {
    expect(colors.live).toBe("#FF5B3A");
    expect(colors.cue).toBe("#37D1BF");
    expect(colors.stage).toBe("#F2B441");
    expect(colors.mod).toBe("#C9BFFF");
  });

  it("ogni font ha una famiglia di riserva", () => {
    for (const value of Object.values(fonts)) expect(value.split(",").length).toBeGreaterThan(1);
  });

  it("nomina le variabili CSS in modo stabile", () => {
    expect(cssVar("bg2")).toBe("--cl-bg-2");
    expect(cssVar("liveBg")).toBe("--cl-live-bg");
    expect(cssVar("display")).toBe("--cl-display");
  });

  it("genera un CSS con tutti i token", () => {
    const css = tokensCss();
    for (const key of [...Object.keys(colors), ...Object.keys(fonts)]) expect(css).toContain(cssVar(key));
  });

  it("converte i colori per WebGL", () => {
    expect(hexToNumber("#FF5B3A")).toBe(0xff5b3a);
    expect(() => hexToNumber("rosso")).toThrow();
  });
});
