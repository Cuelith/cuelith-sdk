import { z } from "zod";

/**
 * Ogni metodo del protocollo appartiene a un ambito; un ruolo e' l'elenco
 * degli ambiti (piu' eventuali metodi singoli) che una postazione o un modulo
 * puo' usare. Il motore controlla ambito e proprieta' prima di applicare un
 * comando (errori 4030 e 4090).
 */
export const SCOPES = [
  "session",
  "read",
  "cue",
  "edit",
  /** Librerie e archivio media (dal protocollo 1.2). */
  "library",
  "output.control",
  "output.config",
  "show",
  "plugins",
  "plugin.command",
  "admin",
  "plugin.self",
] as const;
export const ScopeSchema = z.enum(SCOPES);
export type Scope = z.infer<typeof ScopeSchema>;

export const RoleIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*(?::[a-z0-9.-]+)?$/, "protocol.roleId.invalid");
export type RoleId = z.infer<typeof RoleIdSchema>;

export interface Role {
  readonly id: RoleId;
  /** Chiave di traduzione del nome mostrato nell'interfaccia. */
  readonly titleKey: string;
  readonly scopes: readonly Scope[];
  /** Metodi consentiti anche fuori dagli ambiti, es. il telecomando. */
  readonly methods: readonly string[];
}

export const BUILTIN_ROLES = {
  director: {
    id: "director",
    titleKey: "core.role.director",
    scopes: SCOPES.filter((s) => s !== "plugin.self"),
    methods: [],
  },
  operator: {
    id: "operator",
    titleKey: "core.role.operator",
    scopes: [
      "session",
      "read",
      "cue",
      "edit",
      "library",
      "output.control",
      "show",
      "plugin.command",
    ],
    methods: [],
  },
  remote: {
    id: "remote",
    titleKey: "core.role.remote",
    scopes: ["session", "read"],
    methods: ["cue.next", "cue.prev"],
  },
  viewer: {
    id: "viewer",
    titleKey: "core.role.viewer",
    scopes: ["session", "read"],
    methods: [],
  },
} as const satisfies Record<string, Role>;

export type BuiltinRoleId = keyof typeof BUILTIN_ROLES;

/**
 * Ruolo assegnato al processo di un modulo: "plugin:<id del modulo>". Dal
 * protocollo 1.8 comprende plugin.command: il motore lascia chiamare solo i
 * comandi del modulo stesso e dei moduli da cui dipende.
 */
export function pluginRole(pluginId: string): Role {
  return {
    id: `plugin:${pluginId}`,
    titleKey: "core.role.plugin",
    scopes: ["session", "read", "cue", "edit", "library", "plugin.command", "plugin.self"],
    methods: [],
  };
}

export function roleAllows(role: Role, method: string, scope: Scope): boolean {
  return role.scopes.includes(scope) || role.methods.includes(method);
}

/**
 * Cosa puo' chiedere al motore il pannello di un modulo (attraverso la
 * postazione, dal protocollo 1.8): come il processo del modulo, tranne i
 * metodi riservati al processo (storage, eventi), e i comandi solo del
 * proprio modulo.
 */
export function panelAllows(
  pluginId: string,
  method: string,
  scope: Scope,
  params: unknown,
): boolean {
  if (scope === "plugin.self") return false;
  if (scope === "plugin.command") {
    const target = (params as { pluginId?: unknown } | null | undefined)?.pluginId;
    return target === pluginId;
  }
  return roleAllows(pluginRole(pluginId), method, scope);
}
