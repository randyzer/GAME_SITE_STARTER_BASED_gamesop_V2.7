import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

import type { ContentEntryReference } from "./page-resolution";

function listContentFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return listContentFiles(path);
      }

      return [".md", ".mdx"].includes(extname(entry.name)) ? [path] : [];
    })
    .sort();
}

function extractPageId(source: string, filePath: string) {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) {
    throw new Error(`Missing frontmatter in content file: ${filePath}`);
  }

  const pageId = frontmatter[1].match(
    /^pageId:\s*["']?([a-z0-9]+(?:[.-][a-z0-9]+)*)["']?\s*$/m,
  );
  if (!pageId) {
    throw new Error(`Missing or invalid pageId in content file: ${filePath}`);
  }

  return pageId[1];
}

export function readContentEntriesFromDirectory(
  directory: string,
  collection: string,
): ContentEntryReference[] {
  return listContentFiles(directory).map((filePath) => {
    const extension = extname(filePath);
    const id = relative(directory, filePath)
      .split(sep)
      .join("/")
      .slice(0, -extension.length);
    const source = readFileSync(filePath, "utf8");
    const pageId = extractPageId(source, filePath);

    return {
      collection,
      id,
      data: { pageId },
      body: source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, ""),
    };
  });
}
