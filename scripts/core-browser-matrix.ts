export const browserEngines = ["chromium", "firefox", "webkit"] as const;
export type BrowserEngine = typeof browserEngines[number];
export type CoreRole = "shell-nav" | "content-detail" | "recovery-404";
export type CaseCategory = "baseline" | "no-js" | "boundary" | "reduced-motion" | "live-resize";

export interface BrowserCase {
  caseId: string;
  category: CaseCategory;
  engine: BrowserEngine;
  role: CoreRole;
  route: string;
  viewport: { width: number; height: number };
  javascript: boolean;
  reducedMotion: "reduce" | "no-preference";
  requiredAssertions: string[];
}

const routes: Record<CoreRole, string> = {
  "shell-nav": "/",
  "content-detail": "/guides/getting-started/",
  "recovery-404": "/__ws06a_missing_route__/",
};
const roles = Object.keys(routes) as CoreRole[];
const common = ["http-status", "visible-h1", "main-content", "document-overflow", "skip-link", "footer-keyboard", "browser-errors"];

function entry(category: CaseCategory, engine: BrowserEngine, role: CoreRole, width: number, height: number): BrowserCase {
  const javascript = category !== "no-js";
  const requiredAssertions = [...common, "skip-keyboard"];
  if (role === "shell-nav") {
    requiredAssertions.push("navigation-mode", "navigation-keyboard", "target-size");
    if (javascript) requiredAssertions.push("nested-cleanup", "ordinary-navigation", "same-document-focus");
  }
  if (role === "content-detail") requiredAssertions.push("article-content", "table-local-scroll");
  if (role === "recovery-404") requiredAssertions.push("recovery-navigation");
  if (category === "boundary" && width <= 621) requiredAssertions.push("layout-boundary");
  if (category === "reduced-motion") requiredAssertions.push("reduced-motion");
  if (category === "live-resize") requiredAssertions.push("resize-focus");
  return {
    caseId: `${category}:${engine}:${role}:${width}x${height}`,
    category, engine, role, route: routes[role], viewport: { width, height }, javascript,
    reducedMotion: category === "reduced-motion" ? "reduce" : "no-preference", requiredAssertions,
  };
}

export const coreBrowserMatrix: BrowserCase[] = [
  ...browserEngines.flatMap((engine) => [[390, 844], [768, 1024], [1280, 800]].flatMap(
    ([width, height]) => roles.map((role) => entry("baseline", engine, role, width, height)),
  )),
  ...browserEngines.map((engine) => entry("no-js", engine, "shell-nav", 390, 844)),
  ...[899, 900, 901].map((width) => entry("boundary", "chromium", "shell-nav", width, 800)),
  ...[619, 620, 621].flatMap((width) => roles.map((role) => entry("boundary", "chromium", role, width, 844))),
  ...[[390, 844], [1280, 800]].flatMap(([width, height]) =>
    (["shell-nav", "content-detail"] as CoreRole[]).map((role) => entry("reduced-motion", "chromium", role, width, height))),
  entry("live-resize", "chromium", "shell-nav", 899, 800),
];

export function validateMatrix(): string[] {
  const errors: string[] = [];
  if (coreBrowserMatrix.length !== 47) errors.push("matrix must contain 47 cases");
  const counts: Record<CaseCategory, number> = { baseline: 27, "no-js": 3, boundary: 12, "reduced-motion": 4, "live-resize": 1 };
  for (const [category, count] of Object.entries(counts)) {
    if (coreBrowserMatrix.filter((row) => row.category === category).length !== count) errors.push(`invalid ${category} count`);
  }
  if (new Set(coreBrowserMatrix.map((row) => row.caseId)).size !== 47) errors.push("case IDs must be unique");
  return errors;
}
