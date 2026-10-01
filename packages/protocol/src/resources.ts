import { z } from "zod";

// Risorse (dal protocollo 1.9): quanto usano la piattaforma e i moduli
// attivi, rispetto a cio' che il computer ha. Serve a sapere prima se il PC
// reggera' il lavoro. CPU in percentuale di un core (200 = due core pieni),
// memoria in MB.

export const ResourceUsageSchema = z.strictObject({
  memoryMB: z.number().nonnegative(),
  cpuPercent: z.number().nonnegative(),
});
export type ResourceUsage = z.infer<typeof ResourceUsageSchema>;

/**
 * Consumo dichiarato da un modulo nel manifest (`resources`): a riposo e al
 * massimo. E' una stima di chi lo scrive: Cuelith ricorda anche il massimo
 * osservato davvero sul computer e usa il piu' alto dei due.
 */
export const DeclaredResourcesSchema = z
  .strictObject({
    memoryMB: z.strictObject({
      idle: z.number().positive().max(65_536),
      peak: z.number().positive().max(65_536),
    }),
    cpuPercent: z.strictObject({
      idle: z.number().min(0).max(6400),
      peak: z.number().min(0).max(6400),
    }),
  })
  .refine((r) => r.memoryMB.idle <= r.memoryMB.peak && r.cpuPercent.idle <= r.cpuPercent.peak, {
    message: "protocol.manifest.resourcesOrder",
  });
export type DeclaredResources = z.infer<typeof DeclaredResourcesSchema>;

/** Una parte del sistema: il motore, la postazione, un'uscita, la scheda video, un modulo. */
export const ResourcePartSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(["engine", "station", "output", "gpu", "other", "module"]),
  /** Nome da mostrare (es. il nome dell'uscita o del modulo); per le parti del nucleo, assente. */
  name: z.string().optional(),
  /** Ultima misura; assente se la parte non la fornisce (es. un modulo senza SDK). */
  current: ResourceUsageSchema.optional(),
  /** Minimo e massimo osservati (il massimo resta tra un avvio e l'altro). */
  low: ResourceUsageSchema.optional(),
  peak: ResourceUsageSchema.optional(),
  declared: DeclaredResourcesSchema.optional(),
});
export type ResourcePart = z.infer<typeof ResourcePartSchema>;

export const OutputFramesSchema = z.strictObject({
  outputId: z.string().min(1),
  /** Fotogrammi al secondo disegnati nell'ultimo intervallo. */
  fps: z.number().nonnegative(),
  /** Fotogrammi arrivati in ritardo (pausa oltre 50 ms) nell'ultimo intervallo. */
  lateFrames: z.number().int().nonnegative(),
});
export type OutputFrames = z.infer<typeof OutputFramesSchema>;

export const ResourceLevelSchema = z.enum(["ok", "warning", "danger"]);
export type ResourceLevel = z.infer<typeof ResourceLevelSchema>;

export const ResourceReportSchema = z.strictObject({
  sampledAt: z.iso.datetime(),
  system: z.strictObject({
    cpuModel: z.string(),
    cpuCores: z.number().int().positive(),
    memoryTotalMB: z.number().positive(),
    memoryFreeMB: z.number().nonnegative(),
    gpu: z.string().optional(),
  }),
  parts: z.array(ResourcePartSchema),
  outputs: z.array(OutputFramesSchema),
  /** Somma di piattaforma e moduli attivi: a riposo, adesso, al massimo. */
  totals: z.strictObject({
    min: ResourceUsageSchema,
    current: ResourceUsageSchema,
    max: ResourceUsageSchema,
  }),
  level: ResourceLevelSchema,
  /** Perche' il livello non e' "ok" (chiavi di traduzione). */
  reasons: z.array(z.string()),
});
export type ResourceReport = z.infer<typeof ResourceReportSchema>;

/** Soglie del semaforo, in frazione della capacita' del computer. */
export const RESOURCE_THRESHOLDS = {
  /** Oltre: giallo. */
  warning: 0.7,
  /** Oltre: rosso. */
  danger: 0.9,
  /** Fotogrammi in ritardo in un intervallo oltre i quali le uscite soffrono. */
  lateFrames: 3,
} as const;

/**
 * Somma le parti e decide il semaforo. A riposo: il minimo osservato del
 * nucleo piu' il riposo dei moduli (dichiarato, o osservato). Al massimo: il
 * piu' alto tra dichiarato e osservato, per ogni parte.
 */
export function summarizeResources(
  parts: readonly ResourcePart[],
  system: ResourceReport["system"],
  outputs: readonly OutputFrames[],
): Pick<ResourceReport, "totals" | "level" | "reasons"> {
  const zero = (): ResourceUsage => ({ memoryMB: 0, cpuPercent: 0 });
  const add = (a: ResourceUsage, b: ResourceUsage | undefined) => {
    if (b === undefined) return;
    a.memoryMB += b.memoryMB;
    a.cpuPercent += b.cpuPercent;
  };
  const max = (...values: (ResourceUsage | undefined)[]): ResourceUsage | undefined => {
    const present = values.filter((v): v is ResourceUsage => v !== undefined);
    if (present.length === 0) return undefined;
    return {
      memoryMB: Math.max(...present.map((v) => v.memoryMB)),
      cpuPercent: Math.max(...present.map((v) => v.cpuPercent)),
    };
  };
  const totals = { min: zero(), current: zero(), max: zero() };
  for (const part of parts) {
    const declaredIdle =
      part.declared === undefined
        ? undefined
        : { memoryMB: part.declared.memoryMB.idle, cpuPercent: part.declared.cpuPercent.idle };
    const declaredPeak =
      part.declared === undefined
        ? undefined
        : { memoryMB: part.declared.memoryMB.peak, cpuPercent: part.declared.cpuPercent.peak };
    add(totals.min, declaredIdle ?? part.low ?? part.current);
    add(totals.current, part.current);
    add(totals.max, max(declaredPeak, part.peak, part.current));
  }
  const round = (u: ResourceUsage): ResourceUsage => ({
    memoryMB: Math.round(u.memoryMB),
    cpuPercent: Math.round(u.cpuPercent),
  });

  const memory = system.memoryTotalMB;
  const cpu = system.cpuCores * 100;
  const reasons: string[] = [];
  let level: ResourceLevel = "ok";
  const raise = (to: ResourceLevel, reason: string) => {
    reasons.push(reason);
    if (to === "danger" || level === "ok") level = to;
  };
  if (outputs.some((o) => o.lateFrames >= RESOURCE_THRESHOLDS.lateFrames))
    raise("danger", "core.resources.reason.lateFrames");
  if (totals.max.memoryMB > memory * RESOURCE_THRESHOLDS.danger)
    raise("danger", "core.resources.reason.memoryMax");
  else if (totals.max.memoryMB > memory * RESOURCE_THRESHOLDS.warning)
    raise("warning", "core.resources.reason.memoryMax");
  if (system.memoryFreeMB < memory * (1 - RESOURCE_THRESHOLDS.danger))
    raise("warning", "core.resources.reason.memoryFree");
  if (totals.current.cpuPercent > cpu * RESOURCE_THRESHOLDS.warning)
    raise("warning", "core.resources.reason.cpuNow");
  else if (totals.max.cpuPercent > cpu * RESOURCE_THRESHOLDS.danger)
    raise("warning", "core.resources.reason.cpuMax");
  return {
    totals: { min: round(totals.min), current: round(totals.current), max: round(totals.max) },
    level,
    reasons,
  };
}
