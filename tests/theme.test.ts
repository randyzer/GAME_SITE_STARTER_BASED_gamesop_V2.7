import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  pageModuleSchema,
  type PageModule,
} from "../src/data/schemas/page-inventory";

const themeUrl = new URL("../src/styles/theme.css", import.meta.url);
// Paired adoption checks supply a separately verified source; this never selects fewer tests.
const canonicalSourceRoot = process.env.STARTER_CANONICAL_SOURCE_ROOT;
if (canonicalSourceRoot !== undefined && (!canonicalSourceRoot.trim() || !isAbsolute(canonicalSourceRoot))) {
  throw new Error("STARTER_CANONICAL_SOURCE_ROOT must be a nonempty absolute source path.");
}
const canonicalThemeUrl = canonicalSourceRoot === undefined
  ? themeUrl
  : pathToFileURL(join(canonicalSourceRoot, "src/styles/theme.css"));
const pageFamiliesUrl = new URL(
  "../src/styles/page-families.css",
  import.meta.url,
);
const globalStylesUrl = new URL(
  "../src/styles/global.css",
  import.meta.url,
);
const baseLayoutUrl = new URL(
  "../src/layouts/BaseLayout.astro",
  import.meta.url,
);
const notFoundPageUrl = new URL("../src/pages/404.astro", import.meta.url);
const pageInventoryUrl = new URL(
  "../src/data/page-inventory.json",
  import.meta.url,
);

const familyTokenDecisions = {
  core: "--color-accent",
  guides: "--color-guides",
  heroes: "--color-heroes",
  weapons: "--color-weapons",
  items: "--color-items",
  maps: "--color-maps",
  tierLists: "--color-meta",
  news: "--color-updates",
  search: "--color-accent",
  tools: "--color-tools",
} satisfies Record<PageModule, string>;

const familyTokens = [
  ...new Set(Object.values(familyTokenDecisions)),
].filter((token) => token !== "--color-accent");

function read(url: URL): string {
  expect(existsSync(url), `${url.pathname} exists`).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

function familyAccentValue(module: PageModule): string {
  const token = familyTokenDecisions[module];
  return token === "--color-accent"
    ? "var(--color-accent)"
    : `var(${token}, var(--color-accent))`;
}

function normalizePureMappingCss(styles: string): string {
  return styles
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,=\[\]])\s*/g, "$1");
}

describe("theme tokens", () => {
  it("preserves the existing semantic color contract", () => {
    const theme = read(themeUrl);
    for (const token of [
      "--color-background",
      "--color-surface",
      "--color-text",
      "--color-text-muted",
      "--color-primary",
      "--color-accent",
      "--color-accent-strong",
      "--color-border",
      "--color-border-strong",
      "--color-footer-background",
      "--color-footer-text",
      "--color-footer-muted",
      "--color-footer-border",
    ]) {
      expect(theme).toContain(`${token}:`);
    }
    const declared = new Set([...theme.matchAll(/(--[a-z][a-z0-9-]*)\s*:/g)].map(([, token]) => token));
    for (const [, reference] of theme.matchAll(/var\(\s*(--[a-z][a-z0-9-]*)/g)) {
      expect(declared.has(reference), `theme reference ${reference} is declared`).toBe(true);
    }
  });

  it("uses a neutral fallback palette instead of the previous beige green orange identity", () => {
    const theme = read(canonicalThemeUrl);

    expect(theme).not.toMatch(/#eee9dc|#ddd6c5|#1f4a3b|#ee4b20|#a92709/i);
    expect(theme).toMatch(/--color-background:\s*#f6f5f1;/);
    expect(theme).toMatch(/--color-accent:\s*#4f6f78;/);
  });

  it("defines every approved family token as a default base-accent fallback", () => {
    const theme = read(canonicalThemeUrl);

    for (const token of familyTokens) {
      expect(theme).toMatch(
        new RegExp(`${token}:\\s*var\\(--color-accent\\);`),
      );
    }
    const adopted = read(themeUrl);
    const declared = new Set([...adopted.matchAll(/(--[a-z][a-z0-9-]*)\s*:/g)].map(([, token]) => token));
    for (const token of familyTokens) {
      const value = adopted.match(new RegExp(`${token}:\\s*([^;{}]+);`))?.[1].trim();
      // Current family values use local color literals or existing semantic color references.
      expect(value, `${token} has a local color value`).toMatch(/^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|var\(--color-[a-z-]+\))$/i);
      for (const [, reference] of value!.matchAll(/var\((--color-[a-z-]+)\)/g)) {
        expect(declared.has(reference), `${token} references declared ${reference}`).toBe(true);
      }
    }
  });

  it("loads theme and family contracts from the global stylesheet", () => {
    const globalStyles = read(globalStylesUrl);

    expect(globalStyles).toMatch(/@import\s+["']\.\/theme\.css["'];/);
    expect(globalStyles).toMatch(
      /@import\s+["']\.\/page-families\.css["'];/,
    );
  });
});

describe("controlled page-family mapping", () => {
  it("makes the explicit decision table exhaustive for the live module schema", () => {
    expect(Object.keys(familyTokenDecisions).sort()).toEqual(
      [...pageModuleSchema.options].sort(),
    );
  });

  it("is exactly the generated pure mapping for every live module", () => {
    const familyStyles = read(pageFamiliesUrl);
    const expectedFamilyStyles = pageModuleSchema.options
      .map(
        (module) =>
          `[data-page-family="${module}"] {\n  --page-accent: ${familyAccentValue(module)};\n}`,
      )
      .join("\n\n");

    expect(normalizePureMappingCss(familyStyles)).toBe(
      normalizePureMappingCss(expectedFamilyStyles),
    );
  });

  it("maps core and search directly to the base accent", () => {
    const familyStyles = normalizePureMappingCss(read(pageFamiliesUrl));

    expect(familyStyles).toContain(
      normalizePureMappingCss(
        '[data-page-family="core"] { --page-accent: var(--color-accent); }',
      ),
    );
    expect(familyStyles).toContain(
      normalizePureMappingCss(
        '[data-page-family="search"] { --page-accent: var(--color-accent); }',
      ),
    );
  });

  it("contains no palette values or arbitrary family keys", () => {
    const familyStyles = read(pageFamiliesUrl);

    expect(familyStyles).not.toMatch(
      /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\s*\(/i,
    );
    expect(familyStyles).not.toMatch(
      /\b(?:color|lab|lch|oklab|oklch)\s*\(/i,
    );
    expect(familyStyles).not.toMatch(
      /data-page-family=["'](?:beginner-guides|early-game|hero-detail)["']/,
    );
    for (const arbitraryKey of [
      "beginner-guides",
      "early-game",
      "hero-detail",
    ]) {
      expect(pageModuleSchema.safeParse(arbitraryKey).success).toBe(false);
    }
  });
});

describe("page-family presentation boundary", () => {
  it("binds the BaseLayout family only to the validated page module", () => {
    const baseLayout = read(baseLayoutUrl);
    const bindings = [
      ...baseLayout.matchAll(/data-page-family=\{([^}]+)\}/g),
    ].map(([, binding]) => binding.trim());

    expect(bindings).toEqual(["page.module"]);
    expect(baseLayout).toMatch(
      /<body\s+id=["']top["']\s+data-page-family=\{page\.module\}>/,
    );
    expect(baseLayout).not.toMatch(/\bpageFamily\??\s*:/);
  });

  it("removes the stale hard-coded browser theme color", () => {
    const baseLayout = read(baseLayoutUrl);

    expect(baseLayout).not.toMatch(/<meta\s+name=["']theme-color["']/);
    expect(baseLayout).not.toContain("#ee4b20");
  });

  it("uses the single page accent only for controlled non-text hooks", () => {
    const globalStyles = read(globalStylesUrl);
    const pageAccent = "var(--page-accent, var(--color-accent))";

    for (const selector of [
      ".desktop-nav__link::after",
      ".article__header",
      ".hub-page__header",
      ".search-shell__header",
      ".static-page__header",
      ".entity-database__header",
      ".entity-page__header",
      ".tool-shell__header",
      ".game-media img",
    ]) {
      const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(globalStyles).toMatch(
        new RegExp(
          `${escapedSelector}[^}]*${pageAccent.replace(/[()]/g, "\\$&")}`,
        ),
      );
    }

    expect(globalStyles).not.toMatch(
      /var\(--color-(?:guides|heroes|weapons|items|maps|updates|meta|tools)\b/,
    );
  });

  it("preserves contrast-safe shared tokens for text accents", () => {
    const globalStyles = read(globalStylesUrl);

    expect(globalStyles).toMatch(
      /\.mobile-nav a\[aria-current="page"\],[^}]*color:\s*var\(--color-accent-strong\);/,
    );
    expect(globalStyles).toMatch(
      /\.article__classification \.eyebrow\s*\{[^}]*color:\s*var\(--color-accent-strong\);/,
    );
    expect(globalStyles).toMatch(
      /\.wiki-article__header > \.eyebrow\s*\{[^}]*color:\s*var\(--color-accent-strong\);/,
    );
    expect(globalStyles).toMatch(
      /\.guide-index__number\s*\{[^}]*color:\s*var\(--color-accent\);/,
    );
  });

  it("lets the footer follow theme tokens instead of fixed inverted colors", () => {
    const globalStyles = read(globalStylesUrl);
    const footerBlock = globalStyles.match(/\.site-footer\s*\{[^}]*\}/)?.[0] ?? "";

    expect(footerBlock).toContain("var(--color-footer-background");
    expect(footerBlock).toContain("var(--color-footer-text");
    expect(footerBlock).not.toMatch(/background:\s*var\(--color-text\)/);
    expect(footerBlock).not.toMatch(/color:\s*var\(--color-background\)/);
    expect(globalStyles).toMatch(
      /\.site-footer__meta a\s*\{[^}]*color:\s*var\(--color-footer-text/,
    );
  });

  it("does not expose the coordinate rail as a default Starter identity motif", () => {
    const baseLayout = read(baseLayoutUrl);
    const globalStyles = read(globalStylesUrl);

    expect(baseLayout).not.toContain('class="coordinate"');
    expect(globalStyles).not.toMatch(/^\s*\.coordinate\s*\{/m);
  });

  it("removes unused radar, signal-strip and method motif styles", () => {
    const globalStyles = read(globalStylesUrl);

    expect(globalStyles).not.toMatch(
      /\.hero__instrument|\.instrument__|\.signal-strip|\.rail-block--signal|\.method__grid|@keyframes\s+radar-sweep/,
    );
  });

  it("keeps 404 visible copy neutral instead of coordinate or signal themed", () => {
    const notFoundPage = read(notFoundPageUrl);
    const pageInventory = read(pageInventoryUrl);

    expect(notFoundPage).not.toMatch(
      /Coordinate unavailable|signal lost|Return to dispatch/i,
    );
    expect(pageInventory).not.toMatch(/requested coordinate/i);
  });
});


const themeRolesUrl = new URL("../src/core/theme-roles.ts", import.meta.url);

async function readThemeAdapter() {
  expect(existsSync(themeRolesUrl), "typed role adapter exists").toBe(true);
  return import(themeRolesUrl.pathname);
}

describe("semantic visual-role adapter", () => {
  it("resolves omitted roles to the exact legacy fallback without authoring a project choice", async () => {
    const { resolveVisualRoles, DEFAULT_VISUAL_ROLES } = await readThemeAdapter();
    expect(resolveVisualRoles(undefined)).toEqual({
      font: "editorial", density: "comfortable", shape: "square", state: "lifted",
    });
    expect(Object.isFrozen(DEFAULT_VISUAL_ROLES)).toBe(true);
  });

  it("resolves a complete choice to only four immutable role identifiers", async () => {
    const { resolveVisualRoles } = await readThemeAdapter();
    const selection = { font: "interface", density: "compact", shape: "soft", state: "quiet" } as const;
    const roles = resolveVisualRoles(selection);
    expect(roles).toEqual(selection);
    expect(Object.keys(roles).sort()).toEqual(["density", "font", "shape", "state"]);
    expect(Object.isFrozen(roles)).toBe(true);
    expect(roles).not.toBe(selection);
  });

  it("binds exactly four site-wide roles on html while preserving Inventory family authority", () => {
    const layout = read(baseLayoutUrl);
    expect(layout).toContain("resolveVisualRoles(siteConfig.visualRoles)");
    expect([...layout.matchAll(/data-theme-([a-z]+)=\{roles\.([a-z]+)\}/g)].map(m => [m[1], m[2]]))
      .toEqual([["font", "font"], ["density", "density"], ["shape", "shape"], ["state", "state"]]);
    expect(layout).toMatch(/<html[\s\S]*?data-theme-state=\{roles\.state\}[\s\S]*?>/);
    expect(layout).toContain("data-page-family={page.module}");
    expect(layout).not.toMatch(/style=\{|data-theme-[^=]+=\{(?:page\.|.*(?:route|pageType|module))/);
  });

  it("preserves legacy font stacks behind semantic aliases", () => {
    const theme = read(themeUrl), global = read(globalStylesUrl);
    const defaults = read(canonicalThemeUrl);
    expect(defaults).toContain('--role-font-display: "Iowan Old Style", "Baskerville", "Times New Roman", serif;');
    expect(defaults).toContain('--role-font-body: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;');
    expect(defaults).toContain('--role-font-utility: "SFMono-Regular", "Cascadia Mono", "Liberation Mono", monospace;');
    for (const [alias, role] of [["display", "display"], ["body", "body"], ["mono", "utility"]]) {
      expect(theme).toMatch(new RegExp(`--role-font-${role}:\\s*[^;{}]+;`));
      expect(global).toContain(`--${alias}: var(--role-font-${role});`);
    }
    expect(theme).not.toMatch(/@font-face|https?:|url\(/);
    expect(defaults).not.toMatch(/@font-face|https?:|url\(/);
  });

  it("defines only approved role selectors and preserves fallback density at each breakpoint", () => {
    const theme = read(themeUrl);
    for (const [role, value] of [["font", "interface"], ["density", "compact"], ["shape", "soft"], ["state", "quiet"]]) {
      expect(theme).toContain(`[data-theme-${role}="${value}"]`);
    }
    const selectors = [...theme.matchAll(/\[data-theme-([a-z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\]/g)]
      .map(([, role, quoted, singleQuoted, unquoted]) => `${role}:${quoted ?? singleQuoted ?? unquoted ?? ""}`);
    expect([...new Set(selectors)].sort()).toEqual(["density:compact", "font:interface", "shape:soft", "state:quiet"]);
    for (const token of ["shell-gutter", "section-spacing", "card-padding", "control-min-height", "control-radius", "surface-radius", "media-radius"]) {
      expect(theme).toContain(`--role-${token}:`);
      expect(read(globalStylesUrl)).toContain(`var(--role-${token})`);
    }
    const controlHeights = [...theme.matchAll(/--role-control-min-height:\s*([^;]+);/g)].map(([, value]) => value.trim());
    expect(controlHeights.length).toBeGreaterThan(0);
    for (const value of controlHeights) {
      expect(value).toMatch(/^\d+(?:\.\d+)?px$/);
      expect(Number.parseFloat(value)).toBeGreaterThanOrEqual(44);
    }
    const defaults = read(canonicalThemeUrl);
    expect(defaults).toMatch(/--role-shell-gutter:\s*48px;/);
    expect(defaults).toMatch(/--role-card-padding:\s*26px;/);
    expect(defaults).toMatch(/--role-control-min-height:\s*48px;/);
    expect(defaults).toContain("clamp(68px, 9vw, 120px)");
    expect(defaults).toMatch(/@media \(max-width: 900px\)[\s\S]*?--role-shell-gutter:\s*36px;/);
    expect(defaults).toMatch(/@media \(max-width: 620px\)[\s\S]*?--role-shell-gutter:\s*28px;/);
    expect(defaults).toMatch(/--role-control-radius:\s*0px;/);
    expect(defaults).toMatch(/--role-surface-radius:\s*0px;/);
    expect(defaults).toMatch(/--role-media-radius:\s*0px;/);
  });

  it("limits the state role to decoration, keeping focus and current-state guarantees fixed", () => {
    const theme = read(themeUrl), global = read(globalStylesUrl);
    const quiet = theme.match(/\[data-theme-state="quiet"\]\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(quiet).toContain("none");
    expect(quiet).not.toMatch(/focus|outline|current|display|visibility|opacity|pointer|color/);
    expect(theme).not.toMatch(/:focus|aria-current/);
    expect(global).toContain("outline: 3px solid var(--color-accent);");
    expect(global).toContain('a[aria-current="page"]');
    expect(global).toContain("@media (prefers-reduced-motion: reduce)");
    const defaults = read(canonicalThemeUrl);
    expect(defaults).toContain("translate(-3px, -3px)");
    expect(defaults).toContain("translate(-4px, -4px)");
  });
});
