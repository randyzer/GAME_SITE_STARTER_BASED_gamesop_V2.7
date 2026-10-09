import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const currentPatchFiles = [
  "../README.md",
  "../docs/QA_CHECKLIST.md",
  "../docs/CONTENT_AND_DATA_GUIDE.md",
  "../docs/media/README.md",
] as const;

const carriedForwardBaselineDocs = [
  "../docs/CONTENT_AND_DATA_GUIDE.md",
  "../docs/media/README.md",
] as const;

function read(path: string): string {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), `${url.pathname} exists`).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("release identity", () => {
  it("records V2.7 development lineage separately from preserved historical releases", () => {
    const source = read("../README.md");
    expect(source).toContain("V2.7 WS-02 development lineage");
    expect(source).toContain("b067e8d4050478072f25a1dc78a8526cdd128cfd");
    expect(source).toContain("v2.7/evolution");
    expect(source).toContain("1ff2bd01a089975c6b22bff48ca71faffe2be9c710d0123afd3ae47acc7ac24c");
    expect(source).toContain("working-tree candidate is not a V2.7 release");
    expect(source).toContain("synthetic technical evidence");
  });
  it("keeps current Candidate identity distinct from historical patch-line claims", () => {
    for (const path of currentPatchFiles) {
      const source = read(path);
      expect(source).not.toMatch(/^# .*v2\.5\.0/m);
      expect(source).not.toMatch(/\bStarter v2\.5\.0 is\b/);
      expect(source).not.toMatch(/`GAME_SOP v2\.5` is the production methodology/);
      expect(source).not.toMatch(/Record the `GAME_SOP v2\.5` commit used for production methodology/);
      expect(source).not.toMatch(/fit satisfy `GAME_SOP v2\.5`/);
      expect(source).not.toMatch(/implementation candidate/i);
      expect(source).not.toMatch(/not yet implemented|not implemented yet/i);
      expect(source).not.toMatch(/IMPLEMENTATION COMPLETE|final Human PASS/i);
      expect(source).not.toMatch(
        /\bV2\.7 (?:is |has been )?(?:released|tagged|frozen|approved)\b|\b(?:released|tagged|frozen|approved) V2\.7\b|starter-v2\.7/i,
      );

      if (path === "../README.md" || path === "../docs/QA_CHECKLIST.md") {
        expect(source).toMatch(/^# GAME_SITE_STARTER V2\.7 Candidate(?: QA Checklist)?$/m);
        if (path === "../README.md") {
          expect(source).toContain("not a released or production-approved package");
          expect(source).toMatch(/Inherited V2\.6\.5 documentation-correction patch line/i);
          expect(source).toMatch(/GAME_SOP v2\.6\.5\b/);
        } else {
          expect(source).toContain("Candidate is not release identity");
          expect(source).toMatch(/V2\.6\.5 defines the lifecycle-state corrective patch line/i);
        }
      } else {
        expect(source).toMatch(/\b(?:GAME_SITE_STARTER|Starter) v2\.6\.5\b/i);
        expect(source).toMatch(/GAME_SOP v2\.6\.5\b/);
        expect(source).toMatch(/documentation-correction patch line/i);
        expect(source).not.toMatch(
          /under preparation|preparing release|unreleased|not released|release pending|not tagged|untagged|tag pending|not frozen|freeze pending|awaiting freeze/i,
        );
      }
    }
  });

  it("records the exact released and frozen V2.6.4 Starter provenance", () => {
    const readme = read("../README.md");

    expect(readme).toMatch(/V2\.6\.4.*released.*frozen/i);
    expect(readme).toContain("starter-v2.6.4");
    expect(readme).toContain("3138778fa4b4cc0f9daa4687a752de99fd1e6d88");
    expect(readme).toContain("a619b438c39c82340d3b5408e51328d0a6f99bce");
    expect(readme).toContain("9ab1d55c2a5db9a1af91a2c4ccef2b3b1e98e9fd");
  });

  it("preserves explicit V2.6.2 identity in carried-forward baseline subsystem docs", () => {
    for (const path of carriedForwardBaselineDocs) {
      const source = read(path);
      expect(source).toMatch(/\b(?:GAME_SITE_STARTER|Starter) v2\.6\.2\b/i);
      expect(source).toMatch(/GAME_SOP v2\.6\.2\b/);
      expect(source).toMatch(/Phase C|D1-D3/i);
    }
  });

  it("documents the scaffold package version separately from the Starter release identity", () => {
    const packageJson = JSON.parse(read("../package.json"));
    const packageLock = JSON.parse(read("../package-lock.json"));
    const readme = read("../README.md").replace(/\s+/g, " ");

    expect(packageJson.private).toBe(true);
    expect(packageLock.version).toBe(packageJson.version);
    expect(packageLock.packages[""].version).toBe(packageJson.version);
    expect(readme).toContain(
      "`GAME_SITE_STARTER v2.6.5` defines this documentation-correction patch line and its `GAME_SOP v2.6.5` compatibility line.",
    );
    expect(readme).toContain(
      "Release status is determined by the repository's authoritative Git refs and annotated release tag, not by lifecycle prose in this document.",
    );
    expect(readme).toContain(
      `\`package.json\` version \`${packageJson.version}\` is the inherited private application/scaffold package metadata version, also recorded at the top level and root package of \`package-lock.json\`.`,
    );
    expect(readme).toContain(
      "This package metadata value does not identify the Starter release or SOP compatibility line.",
    );
  });

  it("documents normalized Pagefind and NOT FINAL evidence-build contracts", () => {
    const readme = read("../README.md");
    const qa = read("../docs/QA_CHECKLIST.md");

    expect(`${readme}\n${qa}`).toContain("npm run build:evidence");
    expect(qa).toMatch(/normalized contract-required Pagefind payload.*800,000 B/i);
    expect(qa).toContain("dist/EVIDENCE_BUILD_NOT_FINAL.json");
    expect(qa).toMatch(/NOT FINAL/i);
    expect(qa).toMatch(/Human review required/i);
  });
});
