// Import di default: fast-json-patch in CommonJS esporta con Object.assign,
// quindi gli import con nome non funzionerebbero in Node ESM.
import jsonpatch, { type Operation } from "fast-json-patch";
import type { JsonPatchOperation } from "./methods.js";

/** Operazioni che trasformano `before` in `after`. */
export function diffState(before: object, after: object): JsonPatchOperation[] {
  return jsonpatch.compare(before, after) as JsonPatchOperation[];
}

/**
 * Applica una patch senza modificare il documento di partenza. Lancia se la
 * patch non e' applicabile: il chiamante deve allora chiedere una nuova
 * istantanea (state.subscribe).
 */
export function applyStatePatch<T extends object>(doc: T, ops: readonly JsonPatchOperation[]): T {
  const result = jsonpatch.applyPatch(doc, ops as Operation[], true, false);
  return result.newDocument;
}

/**
 * Una patch si applica solo se arriva esattamente dopo l'ultima ricevuta; se
 * un client perde una rev deve chiedere una nuova istantanea (cap. 23).
 */
export function isNextRev(current: number, incoming: number): boolean {
  return incoming === current + 1;
}
