import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { gameConfigSchema } from "../src/config/schema";
import { CORE_SENTINELS } from "../scripts/core-safety-sentinels";
import { createCoreBuildFixture, cleanupCoreBuildFixture, runFixtureNpm, writeFixtureGameConfigSource } from "./helpers/core-build-fixture";

let root: string;
const instruction = CORE_SENTINELS.find(({ id }) => id === "core.setup-title")!.literal;
const audit = () => spawnSync("npm", ["exec", "--", "tsx", "scripts/audit-build.ts"], {
  cwd: root, encoding: "utf8", env: { ...process.env, NODE_ENV: "production" }, timeout: 30_000,
});

beforeAll(() => {
  root = createCoreBuildFixture("starter-pp02-build-");
  const build = runFixtureNpm(root, "build");
  expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);
}, 60_000);
afterAll(() => { if (root) cleanupCoreBuildFixture(root); });

describe("PP-02 real generated output", () => {
  it("does not ship private media instructions", () => {
    expect(() => readFileSync(join(root, "dist/media/README.md"))).toThrow();
    expect(runFixtureNpm(root, "validate").status).toBe(0);
  });

  it.each([
    { path: "404.html", mutate: (text: string) => text.replace("</body>", `<p>${instruction}</p></body>`) },
    { path: "404.html", mutate: (text: string) => text.replace("</body>", '<p>How to Configure This Game Site <span>Start</span>er</p></body>') },
    { path: "index.html", mutate: (text: string) => text.replace("</body>", '<a href="https://gameatlas%2eexample/path">An external link</a></body>') },
    { path: "index.html", mutate: (text: string) => text.replace("</head>", `<meta name="description" content="${instruction}"></head>`) },
    { path: "about/index.html", mutate: (text: string) => text.replace("</head>", `<script type="application/ld+json">{"@type":"Thing","description":"${instruction}"}</script></head>`) },
    { path: "robots.txt", mutate: (text: string) => `${text}\n# https://gameatlas.example/\n` },
    { path: "sitemap-index.xml", mutate: (text: string) => text.replace("field-notes.example", "gameatlas.example") },
    { path: "sitemap-0.xml", mutate: (text: string) => text.replace("field-notes.example", "gameatlas.example") },
    { path: "logo.svg", mutate: (text: string) => text.replace("</svg>", `<text>${instruction}</text></svg>`) },
    { path: "favicon.svg", mutate: (text: string) => text.replace("</svg>", `<text>${instruction}</text></svg>`) },
  ])("rejects stale residue in $path while source is clean", ({ path, mutate }) => {
    const file = join(root, "dist", path);
    const clean = readFileSync(file, "utf8");
    const seeded = mutate(clean);
    expect(seeded).not.toBe(clean);
    try {
      writeFileSync(file, seeded);
      const result = audit();
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/PP-02/);
    } finally { writeFileSync(file, clean); }
  });

  it("accepts an unrelated percent-encoded hostname in otherwise clean output", () => {
    const file = join(root, "dist/index.html");
    const clean = readFileSync(file, "utf8");
    try {
      writeFileSync(file, clean.replace("</body>", '<a href="https://gameatlas.example%2eother.invalid/">An external reference</a></body>'));
      const result = audit();
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    } finally { writeFileSync(file, clean); }
  });

  it("rejects a seeded search fragment and missing required search bytes", () => {
    const directory = join(root, "dist/pagefind/fragment");
    const file = join(directory, readdirSync(directory)[0]);
    const clean = readFileSync(file);
    try {
      const decoded = gunzipSync(clean);
      const data = JSON.parse(decoded.subarray(12).toString("utf8"));
      data.meta.title = instruction;
      writeFileSync(file, gzipSync(Buffer.from(`pagefind_dcd${JSON.stringify(data)}`)));
      const seeded = audit();
      expect(seeded.status).not.toBe(0);
      expect(`${seeded.stdout}\n${seeded.stderr}`).toMatch(/PP-02.*pagefind/);
      rmSync(file);
      expect(audit().status).not.toBe(0);
    } finally { writeFileSync(file, clean); }
  });

  it("fails closed when required copied text is unreadable or unregistered", () => {
    const favicon = join(root, "dist/favicon.svg");
    const clean = readFileSync(favicon);
    try {
      writeFileSync(favicon, new Uint8Array([0xff]));
      expect(`${audit().stderr}`).toMatch(/PP-02.*unreadable/);
      rmSync(favicon);
      expect(audit().status).not.toBe(0);
    } finally { writeFileSync(favicon, clean); }
    const copied = join(root, "public/copied-instructions.txt");
    try {
      writeFileSync(copied, "Ordinary text still needs an explicit public asset registration.");
      const result = runFixtureNpm(root, "validate");
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/unregistered copied public text/);
    } finally { rmSync(copied); }
  });

  it("excludes private notes but blocks ordinary sample branding only in final mode", () => {
    const configPath = join(root, "game.config.ts");
    const clean = readFileSync(configPath);
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs/private-notes.md"), instruction);
    try {
      const serializedConfig = readFileSync(configPath, "utf8").match(
        /^import \{ defineGameConfig \} from "\.\/src\/config\/schema";\n\nexport default defineGameConfig\((\{[\s\S]*\})\);\n$/,
      );
      if (!serializedConfig) throw new Error("Unexpected synthetic fixture config serialization.");
      const fixtureConfig = gameConfigSchema.parse(JSON.parse(serializedConfig[1]));
      writeFixtureGameConfigSource(root, JSON.stringify({
        ...fixtureConfig,
        brand: { ...fixtureConfig.brand, name: "Game Atlas", shortName: "Atlas", mark: "GA" },
        site: { ...fixtureConfig.site, url: "https://gameatlas.example" },
        seo: { ...fixtureConfig.seo, defaultTitle: "Game Atlas — Guides, Builds & Game Data", titleTemplate: "%s | Game Atlas" },
        social: { ...fixtureConfig.social, xHandle: "@gameatlas" },
      }));
      expect(runFixtureNpm(root, "validate").status).not.toBe(0);
      const evidence = runFixtureNpm(root, "build:evidence");
      expect(evidence.status, `${evidence.stdout}\n${evidence.stderr}`).toBe(0);
      expect(evidence.stderr).toMatch(/Warning: PP-02 core.brand/);
      expect(audit().status).not.toBe(0);
      const guide = join(root, "src/content/guides/getting-started.mdx");
      const cleanGuide = readFileSync(guide);
      try {
        writeFileSync(guide, `---\npageId: guide.getting-started\n---\n${instruction}\n`);
        expect(runFixtureNpm(root, "build:evidence").status).not.toBe(0);
      } finally { writeFileSync(guide, cleanGuide); }
    } finally { writeFileSync(configPath, clean); }
  }, 60_000);
});
