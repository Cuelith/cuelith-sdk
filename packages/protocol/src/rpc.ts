import { major, valid } from "semver";
import { z } from "zod";

// Busta JSON-RPC 2.0 (cap. 23): WebSocket per postazioni e renderer, righe
// JSON su stdio per i moduli. Stesso formato ovunque.

/** Versione del protocollo. Versioni maggiori diverse vengono rifiutate (4260). */
export const PROTOCOL_VERSION = "1.24.0";
export const DEFAULT_ENGINE_PORT = 7420;
export const RPC_PATH = "/rpc";
export const MDNS_SERVICE_TYPE = "cuelith";

export function isProtocolCompatible(remote: string): boolean {
  return valid(remote) !== null && major(remote) === major(PROTOCOL_VERSION);
}

export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  /** Non abbinato o token non valido. */
  NotPaired: 4010,
  /** Il ruolo non ha il permesso per questo comando. */
  Forbidden: 4030,
  /** Oggetto richiesto inesistente (entryId, outputId, ...). */
  NotFound: 4040,
  /** Uscita o layer di proprieta' di un altro ruolo. */
  OwnedByOtherRole: 4090,
  /** Parametri non validi. */
  InvalidParameters: 4220,
  /** Versione del protocollo non compatibile. */
  ProtocolIncompatible: 4260,
  /** Modulo richiesto non attivo. */
  PluginNotActive: 5030,
  /** Il modulo non ha risposto entro il tempo massimo (5 s). */
  PluginTimeout: 5040,
} as const;
export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Il messaggio d'errore e' una chiave di traduzione; data.params la completa. */
export interface RpcErrorObject {
  readonly code: number;
  readonly message: string;
  readonly data?: {
    readonly params?: Readonly<Record<string, string>>;
    readonly issues?: readonly unknown[];
  };
}

export type RpcId = number | string;

export interface RpcRequest {
  readonly jsonrpc: "2.0";
  readonly id: RpcId;
  readonly method: string;
  readonly params?: unknown;
}

export interface RpcNotification {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: unknown;
}

export interface RpcSuccess {
  readonly jsonrpc: "2.0";
  readonly id: RpcId;
  readonly result: unknown;
}

export interface RpcFailure {
  readonly jsonrpc: "2.0";
  readonly id: RpcId | null;
  readonly error: RpcErrorObject;
}

export type RpcResponse = RpcSuccess | RpcFailure;
export type RpcMessage = RpcRequest | RpcNotification | RpcResponse;

const IdValue = z.union([z.number(), z.string()]);

const RequestSchema = z.strictObject({
  jsonrpc: z.literal("2.0"),
  id: IdValue,
  method: z.string().min(1),
  params: z.unknown().optional(),
});
const NotificationSchema = z.strictObject({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.unknown().optional(),
});
const SuccessSchema = z.strictObject({
  jsonrpc: z.literal("2.0"),
  id: IdValue,
  result: z.unknown(),
});
const FailureSchema = z.strictObject({
  jsonrpc: z.literal("2.0"),
  id: z.union([IdValue, z.null()]),
  error: z.strictObject({
    code: z.number().int(),
    message: z.string(),
    data: z.unknown().optional(),
  }),
});

export type ParsedMessage =
  | { readonly kind: "request"; readonly message: RpcRequest }
  | { readonly kind: "notification"; readonly message: RpcNotification }
  | { readonly kind: "response"; readonly message: RpcResponse }
  | { readonly kind: "invalid"; readonly error: RpcFailure };

/** Interpreta una riga/frame in arrivo senza mai lanciare eccezioni. */
export function parseRpcMessage(raw: string): ParsedMessage {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {
      kind: "invalid",
      error: rpcError(null, ErrorCode.ParseError, "protocol.rpc.parseError"),
    };
  }
  const request = RequestSchema.safeParse(data);
  if (request.success) return { kind: "request", message: request.data };
  const notification = NotificationSchema.safeParse(data);
  if (notification.success) return { kind: "notification", message: notification.data };
  const success = SuccessSchema.safeParse(data);
  if (success.success) return { kind: "response", message: success.data as RpcSuccess };
  const failure = FailureSchema.safeParse(data);
  if (failure.success) return { kind: "response", message: failure.data as RpcFailure };
  return {
    kind: "invalid",
    error: rpcError(null, ErrorCode.InvalidRequest, "protocol.rpc.invalidRequest"),
  };
}

export function rpcRequest(id: RpcId, method: string, params?: unknown): RpcRequest {
  return params === undefined
    ? { jsonrpc: "2.0", id, method }
    : { jsonrpc: "2.0", id, method, params };
}

export function rpcNotification(method: string, params?: unknown): RpcNotification {
  return params === undefined ? { jsonrpc: "2.0", method } : { jsonrpc: "2.0", method, params };
}

export function rpcResult(id: RpcId, result: unknown): RpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

export function rpcError(
  id: RpcId | null,
  code: number,
  message: string,
  data?: RpcErrorObject["data"],
): RpcFailure {
  return {
    jsonrpc: "2.0",
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

/** Errore lanciabile dal codice del motore o di un modulo, convertito in risposta RPC. */
export class RpcError extends Error {
  readonly code: number;
  readonly data: RpcErrorObject["data"];

  constructor(code: number, message: string, data?: RpcErrorObject["data"]) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = data;
  }

  toObject(): RpcErrorObject {
    return this.data === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, data: this.data };
  }
}
