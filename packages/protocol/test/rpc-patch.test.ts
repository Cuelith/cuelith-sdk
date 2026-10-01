import { describe, expect, it } from "vitest";
import {
  applyStatePatch,
  diffState,
  emptyLayers,
  ErrorCode,
  isNextRev,
  isProtocolCompatible,
  parseRpcMessage,
  PROTOCOL_VERSION,
  rpcRequest,
  StateDocumentSchema,
  type StateDocument,
  isOnAir,
} from "../src/index.js";
import { makeShow } from "./fixtures.js";

describe("parseRpcMessage", () => {
  it("riconosce richieste, notifiche e risposte", () => {
    expect(parseRpcMessage('{"jsonrpc":"2.0","id":42,"method":"cue.next"}').kind).toBe("request");
    expect(parseRpcMessage('{"jsonrpc":"2.0","method":"state.patch","params":{}}').kind).toBe(
      "notification",
    );
    expect(parseRpcMessage('{"jsonrpc":"2.0","id":42,"result":{"rev":1}}').kind).toBe("response");
    expect(
      parseRpcMessage('{"jsonrpc":"2.0","id":43,"error":{"code":4090,"message":"x"}}').kind,
    ).toBe("response");
  });

  it("non lancia mai su input malformato", () => {
    const parsed = parseRpcMessage("{non json");
    expect(parsed.kind).toBe("invalid");
    if (parsed.kind === "invalid") expect(parsed.error.error.code).toBe(ErrorCode.ParseError);
    const wrong = parseRpcMessage('{"jsonrpc":"1.0","id":1,"method":"x"}');
    expect(wrong.kind).toBe("invalid");
    if (wrong.kind === "invalid") expect(wrong.error.error.code).toBe(ErrorCode.InvalidRequest);
  });

  it("costruisce richieste senza params vuoti", () => {
    expect(rpcRequest(1, "cue.next")).toEqual({ jsonrpc: "2.0", id: 1, method: "cue.next" });
  });
});

describe("versione del protocollo", () => {
  it("accetta la stessa versione maggiore e rifiuta le altre", () => {
    expect(isProtocolCompatible(PROTOCOL_VERSION)).toBe(true);
    expect(isProtocolCompatible("1.9.3")).toBe(true);
    expect(isProtocolCompatible("2.0.0")).toBe(false);
    expect(isProtocolCompatible("non-una-versione")).toBe(false);
  });
});

function makeState(): StateDocument {
  return {
    show: makeShow(),
    live: {
      rev: 0,
      cursor: { slideIndex: 0 },
      preview: { slideIndex: 0 },
      layers: emptyLayers(),
      outputs: {},
      activeScene: {},
      clients: [],
      plugins: [],
      dirty: false,
      libraryRev: 0,
    },
  };
}

describe("patch dello stato", () => {
  it("lo StateDocument di prova e' valido", () => {
    expect(StateDocumentSchema.safeParse(makeState()).success).toBe(true);
  });

  it("diff + apply riproducono lo stato senza modificare l'originale", () => {
    const before = makeState();
    const after = structuredClone(before);
    after.live.rev = 1;
    after.live.cursor = { entryId: after.show.playlist[0]?.id, slideIndex: 1 };
    after.show.name = "Culto di Pasqua";
    const ops = diffState(before, after);
    expect(ops.length).toBeGreaterThan(0);
    const snapshot = structuredClone(before);
    const applied = applyStatePatch(before, ops);
    expect(applied).toEqual(after);
    expect(before).toEqual(snapshot);
  });

  it("una patch non applicabile lancia", () => {
    expect(() =>
      applyStatePatch(makeState(), [{ op: "replace", path: "/show/nonEsiste/x", value: 1 }]),
    ).toThrow();
  });

  it("le patch vanno applicate in ordine senza buchi", () => {
    expect(isNextRev(4, 5)).toBe(true);
    expect(isNextRev(4, 6)).toBe(false);
    expect(isNextRev(4, 4)).toBe(false);
  });
});

describe("in onda (decisione 0004)", () => {
  it("in onda solo con una slide in programma e un'uscita non in nero", () => {
    const state = makeState();
    const outputIds = Object.keys(state.show.outputs);
    const live = { blackout: false, freeze: false, status: "ok" as const };
    state.live.outputs = Object.fromEntries(outputIds.map((id) => [id, { ...live }]));
    expect(isOnAir(state)).toBe(false);

    state.live.cursor = { entryId: state.show.playlist[0]?.id ?? "", slideIndex: 0 };
    expect(isOnAir(state)).toBe(true);

    for (const id of outputIds) state.live.outputs[id] = { ...live, blackout: true };
    expect(isOnAir(state)).toBe(false);
    const first = outputIds[0] ?? "";
    state.live.outputs[first] = { ...live };
    expect(isOnAir(state)).toBe(true);
  });
});
