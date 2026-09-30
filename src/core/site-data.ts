import pageInventoryData from "../data/page-inventory.json";
import { legalContent } from "../data/legal-content";
import type { GameConfig } from "../config/schema";
import {
  parsePageInventory,
  type PageInventoryEntry,
} from "../data/schemas/page-inventory";
import { loadGameConfig } from "../config/load-config";
import { buildEnabledPageCatalog } from "./catalog";
import { resolveLegalPageSafety, type ResolvedLegalPayload } from "./legal-safety";

export const siteConfig = loadGameConfig();
export const pageInventory = parsePageInventory(pageInventoryData);
export const enabledPageCatalog = buildEnabledPageCatalog(
  siteConfig,
  pageInventory,
  legalContent,
);

const enabledPageByRoute = new Map(
  enabledPageCatalog.map((page) => [page.route, page]),
);
const enabledPageById = new Map(
  enabledPageCatalog.map((page) => [page.pageId, page]),
);

export interface ResolvedNavigationGroup {
  label?: string;
  page: PageInventoryEntry;
  children: PageInventoryEntry[];
}

export function resolveNavigationGroups(
  groups: GameConfig["navigation"]["groups"],
  enabledPages: PageInventoryEntry[],
): ResolvedNavigationGroup[] {
  const pageById = new Map(enabledPages.map((page) => [page.pageId, page]));
  const referencedPageIds = groups.flatMap((group) => [
    group.pageId,
    ...group.children,
  ]);
  const missingPageIds = referencedPageIds.filter(
    (pageId) => !pageById.has(pageId),
  );

  if (missingPageIds.length > 0) {
    throw new Error(
      `Navigation references page ${missingPageIds.map((pageId) => `"${pageId}"`).join(", ")}, but it is not in the enabled catalog.`,
    );
  }

  return groups.map((group) => ({
    label: "label" in group ? group.label : undefined,
    page: pageById.get(group.pageId)!,
    children: group.children.map((pageId) => pageById.get(pageId)!),
  }));
}

function resolveEnabledPageIds(pageIds: string[]) {
  return pageIds.map((pageId) => {
    const page = enabledPageById.get(pageId);
    if (!page) throw new Error(`Homepage references page "${pageId}", but it is not in the enabled catalog.`);
    return page;
  });
}

export const resolvedNavigationGroups = resolveNavigationGroups(
  siteConfig.navigation.groups,
  enabledPageCatalog,
);
export const primaryNavigationPages = resolvedNavigationGroups.map(
  ({ page }) => page,
);
export const featuredHomepagePages = resolveEnabledPageIds(
  siteConfig.homepage.featuredPageIds,
);
export const homepageBrowsePages = enabledPageCatalog.filter(
  (page) =>
    page.visibility === "public" &&
    !["home", "privacy", "terms", "not-found"].includes(page.pageType),
);

export function getPageByRoute(route: string): PageInventoryEntry {
  const page = enabledPageByRoute.get(route);
  if (!page) {
    throw new Error(`No enabled page is registered for route: ${route}`);
  }

  return page;
}

export function getRelatedPages(page: PageInventoryEntry) {
  return page.relatedPageIds.flatMap((pageId) => {
    const relatedPage = enabledPageById.get(pageId);
    return relatedPage ? [relatedPage] : [];
  });
}

export function getLegalPageContent(page: PageInventoryEntry): ResolvedLegalPayload {
  const result = resolveLegalPageSafety(page, legalContent);
  if (!result.eligible || !result.payload) {
    throw new Error(result.errors.join("\n") || `No approved legal content for page "${page.pageId}".`);
  }
  return result.payload;
}
