import type { GameConfig } from "../config/schema";
import {
  entityModuleDefinitions,
  type EntityFactModule,
} from "../data/entity-modules";
import {
  pageModuleSchema,
  type PageInventoryEntry,
  type PageType,
} from "../data/schemas/page-inventory";
import type { ContentEntryReference } from "./page-resolution";
import { buildEnabledPageCatalog } from "./catalog";
import { resolveNavigationGroups } from "./site-data";
import { resolveLegalPageSafety, type LegalContent } from "./legal-safety";

export type { EntityFactModule } from "../data/entity-modules";

function collectPageCapabilityErrors(page: PageInventoryEntry): string[] {
  const errors: string[] = [];
  const entityDefinition = entityModuleDefinitions.find(
    (definition) => definition.module === page.module,
  );

  if (entityDefinition) {
    if (page.feature !== entityDefinition.module) {
      errors.push(
        `Page "${page.pageId}" uses feature "${page.feature ?? "none"}"; entity module "${entityDefinition.module}" requires feature "${entityDefinition.module}".`,
      );
    }

    const allowedPageTypes = [
      "hub",
      "database",
      entityDefinition.entityType,
    ];
    if (!allowedPageTypes.includes(page.pageType)) {
      errors.push(
        `Page "${page.pageId}" uses page type "${page.pageType}"; entity module "${entityDefinition.module}" supports ${allowedPageTypes.join(", ")}.`,
      );
    }
    if (
      page.pageType === entityDefinition.entityType &&
      page.entityRef?.entityType !== entityDefinition.entityType
    ) {
      errors.push(
        `Page "${page.pageId}" requires an entityRef of type "${entityDefinition.entityType}".`,
      );
    }

    return errors;
  }

  let capability:
    | {
        feature: PageInventoryEntry["feature"];
        pageTypes: PageType[];
      }
    | undefined;

  switch (page.module) {
    case "core":
      capability = {
        feature: undefined,
        pageTypes: ["home", "about", "privacy", "terms", "not-found"],
      };
      break;
    case "guides":
      capability = { feature: "guides", pageTypes: ["guide", "hub"] };
      break;
    case "tierLists":
      capability = { feature: "tierLists", pageTypes: ["meta"] };
      break;
    case "news":
      capability = { feature: "news", pageTypes: ["patch"] };
      break;
    case "search":
      capability = { feature: "search", pageTypes: ["search"] };
      break;
    case "tools":
      capability = {
        feature:
          page.pageType === "calculator" || page.pageType === "planner"
            ? page.pageType
            : undefined,
        pageTypes: ["calculator", "planner"],
      };
      break;
  }

  if (!capability) {
    errors.push(
      `Page "${page.pageId}" uses unsupported module "${page.module}". Supported modules: ${pageModuleSchema.options.join(", ")}.`,
    );
    return errors;
  }
  if (!capability.pageTypes.includes(page.pageType)) {
    errors.push(
      `Page "${page.pageId}" uses page type "${page.pageType}"; module "${page.module}" supports ${capability.pageTypes.join(", ")}.`,
    );
  }
  if (page.feature !== capability.feature) {
    errors.push(
      `Page "${page.pageId}" uses feature "${page.feature ?? "none"}"; module "${page.module}" requires feature "${capability.feature ?? "none"}".`,
    );
  }

  return errors;
}

export interface SiteValidationInput {
  config: GameConfig;
  inventory: PageInventoryEntry[];
  contentEntries: ContentEntryReference[];
  factModules: Partial<Record<EntityFactModule, unknown>>;
  fixedRoutes: string[];
  implementedPageTypes: PageType[];
  legalContent?: LegalContent;
}

export function collectSiteValidationErrors(input: SiteValidationInput) {
  const errors: string[] = [];
  const inventoryByPageId = new Map(
    input.inventory.map((page) => [page.pageId, page]),
  );
  const inventoryRoutes = new Set(input.inventory.map((page) => page.route));
  const legalResults = input.inventory.map((page) => resolveLegalPageSafety(page, input.legalContent));
  errors.push(...legalResults.flatMap((result) => result.errors));
  // Report invalid legal input before excluding it from downstream projections.
  const enabledPages = buildEnabledPageCatalog(
    input.config,
    input.inventory.filter((_page, index) => legalResults[index].errors.length === 0),
    input.legalContent,
  );
  const enabledPageIds = new Set(enabledPages.map((page) => page.pageId));
  const implementedPageTypes = new Set(input.implementedPageTypes);
  const contentByPageId = new Map<string, ContentEntryReference[]>();

  for (const fixedRoute of input.fixedRoutes) {
    if (!inventoryRoutes.has(fixedRoute)) {
      errors.push(`Fixed route "${fixedRoute}" has no inventory entry.`);
    }
  }

  try {
    resolveNavigationGroups(input.config.navigation.groups, enabledPages);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const pageId of input.config.homepage.featuredPageIds) {
    if (!enabledPageIds.has(pageId)) {
      errors.push(
        `Homepage references page "${pageId}", but it is not in the enabled catalog.`,
      );
    }
  }

  for (const pageId of Object.keys(input.config.identity?.articles ?? {})) {
    const page = inventoryByPageId.get(pageId);
    if (!page) {
      errors.push(`Identity config references unknown article pageId "${pageId}".`);
      continue;
    }
    if (!["guide", "meta", "patch"].includes(page.pageType)) {
      errors.push(
        `Identity config pageId "${pageId}" uses non-Article page type "${page.pageType}".`,
      );
    }
  }

  for (const page of input.inventory) {
    errors.push(...collectPageCapabilityErrors(page));

    if (
      page.indexability === "index" &&
      (page.visibility !== "public" || page.publicationStatus !== "published")
    ) {
      errors.push(
        `Indexable page "${page.pageId}" must be public and published.`,
      );
    }

    for (const relatedPageId of page.relatedPageIds) {
      if (!inventoryByPageId.has(relatedPageId)) {
        errors.push(
          `Related page "${relatedPageId}" referenced by "${page.pageId}" does not exist.`,
        );
      }
    }
  }

  for (const contentEntry of input.contentEntries) {
    const pageId = contentEntry.data.pageId;
    const entries = contentByPageId.get(pageId) ?? [];
    entries.push(contentEntry);
    contentByPageId.set(pageId, entries);

    const page = inventoryByPageId.get(pageId);
    if (!page) {
      errors.push(`Content entry references unknown pageId "${pageId}".`);
      continue;
    }

    if (
      !page.contentRef ||
      page.contentRef.collection !== contentEntry.collection ||
      page.contentRef.slug !== contentEntry.id
    ) {
      errors.push(`Content entry does not match contentRef for "${pageId}".`);
    }
  }

  for (const page of enabledPages) {
    if (!implementedPageTypes.has(page.pageType)) {
      errors.push(
        `No route family is implemented for enabled page type "${page.pageType}" (${page.pageId}). Supported page types: ${input.implementedPageTypes.join(", ")}.`,
      );
    }

    if (page.contentRef) {
      const matchingContent = contentByPageId.get(page.pageId) ?? [];
      if (matchingContent.length === 0) {
        errors.push(`Missing content entry for pageId "${page.pageId}".`);
      } else if (matchingContent.length > 1) {
        errors.push(`Duplicate content entries for pageId "${page.pageId}".`);
      }
    }
  }

  for (const definition of entityModuleDefinitions) {
    const module = definition.module;
    if (!input.config.features[module]) {
      continue;
    }

    const facts = input.factModules[module];
    if (facts === undefined) {
      errors.push(
        `Enabled module "${module}" requires src/data/facts/${module}.json.`,
      );
      continue;
    }

    if (Array.isArray(facts) && facts.length === 0) {
      errors.push(`Enabled module "${module}" cannot use an empty fact file.`);
      continue;
    }

    try {
      definition.parse(facts);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Invalid src/data/facts/${module}.json: ${message}`);
    }
  }

  return errors;
}
