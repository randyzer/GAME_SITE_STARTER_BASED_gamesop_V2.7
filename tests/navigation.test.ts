import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const headerUrl = new URL("../src/components/Header.astro", import.meta.url);
const desktopUrl = new URL(
  "../src/components/navigation/DesktopNav.astro",
  import.meta.url,
);
const mobileUrl = new URL(
  "../src/components/navigation/MobileNav.astro",
  import.meta.url,
);
const globalStylesUrl = new URL(
  "../src/styles/global.css",
  import.meta.url,
);

function source(url: URL) {
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("navigation presentation boundary", () => {
  it("passes resolved groups from Header to both navigation renderers", () => {
    const header = source(headerUrl);

    expect(header).toContain("resolvedNavigationGroups");
    expect(header).toMatch(/<DesktopNav[\s\S]*groups=\{resolvedNavigationGroups\}/);
    expect(header).toMatch(/<MobileNav[\s\S]*groups=\{resolvedNavigationGroups\}/);
    expect(header).not.toMatch(/primaryNavigationPages|primaryPageIds/);
  });

  it("keeps desktop navigation presentation-only and links parent Hubs", () => {
    const desktop = source(desktopUrl);

    expect(desktop).toContain('interface Props');
    expect(desktop).toContain('groups: ResolvedNavigationGroup[]');
    expect(desktop).toContain('href={group.page.route}');
    expect(desktop).toContain('group.children.map');
    expect(desktop).not.toMatch(
      /enabledPageCatalog|getPageByRoute|resolveNavigationGroups|primaryPageIds|new Map|\.filter\(/,
    );
  });

  it("renders a configured semantic logo without losing the home link accessible name", () => {
    const header = source(headerUrl);

    expect(header).toContain("brandPresentation.logoPath");
    expect(header).toMatch(/<a class="brand" href="\/" aria-label=\{`\$\{siteConfig\.brand\.name\} home`\}/);
    expect(header).toMatch(/<img[\s\S]*class="brand__logo"[\s\S]*src=\{brandPresentation\.logoPath\}/);
    expect(header).toMatch(/<img[\s\S]*alt=""/);
  });

  it("uses native expandable mobile groups with a direct parent link", () => {
    const mobile = source(mobileUrl);

    expect(mobile).toMatch(/<details class="mobile-nav"/);
    expect(mobile).toMatch(/<summary[^>]*>Menu/);
    expect(mobile).toContain('href={group.page.route}');
    expect(mobile).toContain('Overview');
    expect(mobile).toContain('group.children.map');
    expect(mobile).not.toMatch(
      /enabledPageCatalog|getPageByRoute|resolveNavigationGroups|primaryPageIds|new Map|\.filter\(/,
    );
  });

  it("adds local progressive enhancement without replacing native disclosure state", () => {
    const mobile = source(mobileUrl);
    expect(mobile).toContain('<script is:inline>');
    expect(mobile).toContain('event.key !== "Escape"');
    expect(mobile).toContain('details[open]');
    expect(mobile).toContain('disclosure.open = false');
    expect(mobile).toContain('matchMedia("(max-width: 900px)")');
    expect(mobile).not.toMatch(/aria-expanded=|role="menu"|keydown.*(?:Enter|Space)/);
  });

  it("keeps long mobile navigation inside the viewport", () => {
    const styles = source(globalStylesUrl);
    const panelRule = styles.match(/\.mobile-nav__panel\s*\{([^}]*)\}/)?.[1];

    expect(panelRule).toMatch(/max-height:\s*calc\(100(?:dvh|vh)\s*-\s*\d+px\)/);
    expect(panelRule).toMatch(/overflow-y:\s*auto/);
  });

  it("keeps the mobile menu toggle large enough for touch input", () => {
    const styles = source(globalStylesUrl);
    const toggleRule = styles.match(/\.mobile-nav__toggle\s*\{([^}]*)\}/)?.[1];

    expect(toggleRule).toMatch(/min-height:\s*44px/);
  });
});
