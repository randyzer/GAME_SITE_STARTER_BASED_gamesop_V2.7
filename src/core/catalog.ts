import type { GameConfig } from "../config/schema";
import type { PageInventoryEntry } from "../data/schemas/page-inventory";
import { resolveLegalPageSafety, type LegalContent } from "./legal-safety";

export function buildEnabledPageCatalog(
  config: GameConfig,
  inventory: PageInventoryEntry[],
  legalContent: LegalContent = {},
) {
  const legalResults = inventory.map((page) => resolveLegalPageSafety(page, legalContent));
  const errors = legalResults.flatMap((result) => result.errors);
  if (errors.length > 0) throw new Error(errors.join("\n"));

  return inventory.filter(
    (page, index) =>
      legalResults[index].eligible &&
      page.visibility === "public" &&
      page.publicationStatus === "published" &&
      (!page.feature || config.features[page.feature]),
  );
}
