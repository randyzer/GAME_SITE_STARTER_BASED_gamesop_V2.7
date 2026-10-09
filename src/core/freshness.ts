import type { PageInventoryEntry } from "../data/schemas/page-inventory";
import type { Provenance } from "../data/schemas/provenance";

export interface VersionContext {
  kind: "patch" | "version";
  value: string;
}

type FreshnessPage = Pick<PageInventoryEntry, "publishedAt" | "updatedAt" | "sources">;

export function latestSourceAccessedAt(sources: readonly Pick<Provenance, "accessedAt">[]) {
  return [...sources].sort((left, right) => right.accessedAt.localeCompare(left.accessedAt)).at(0)?.accessedAt;
}

/** Projects authored facts without inferring verification, currency or live telemetry. */
export function resolvePageFreshness(page: FreshnessPage, versionContext?: VersionContext) {
  const sourceCheckedAt = latestSourceAccessedAt(page.sources);
  return {
    ...(page.publishedAt ? { publishedAt: page.publishedAt } : {}),
    updatedAt: page.updatedAt,
    ...(sourceCheckedAt ? { sourceCheckedAt } : {}),
    ...(versionContext ? { versionContext: { kind: versionContext.kind, value: versionContext.value } } : {}),
  };
}
