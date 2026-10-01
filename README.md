# GAME_SITE_STARTER v2.6.5 Documentation-Correction Patch Line

Starter v2.6.5 defines the lifecycle-state corrective patch line for
the static-first Astro foundation for media-rich game wikis. Release status is determined by
the repository's authoritative Git refs and annotated release tag, not by lifecycle prose in
this document. It
keeps the proven publication, fact, SEO, route, search, and reconciliation core
while providing a player-facing Wiki portal, grouped navigation, Wiki articles,
local media, optional FAQ content, neutral theme defaults, and restrained
page-family accents.

The default repository is a small generic adoption example. It deliberately
does not ship fictional game facts, screenshots, news, or entity databases.
V2.6.2 Phase 1C added the approved Pagefind and fresh-evidence contracts on top
of the existing Phase C D1-D3 technical hardening: media
decision tables are projected deterministically, public source rendering uses a
safe metadata boundary, and the runtime contract is Node 22 only. V2.6.3 added
the disabled-by-default monetization seam. V2.6.4 is the released and frozen source baseline
for this documentation-only V2.6.5 patch line.

## Version provenance

These three artifacts have different responsibilities:

- `GAME_SOP v2.6.5` defines the methodology package identity. Its released and frozen
  source baseline is `GAME_SOP v2.6.4` at tag `GAME_SOP_v2.6.4`, commit
  `b8c6f0ef7545635ec57bc3809b233b0945ce1918`, tree
  `a24ddd5218c1269db257927bfcc202515d94647f`, and annotated tag object
  `4a74ae78e5e9a567b3da5f964a4ab3b6012a7a98`. Historical
  `GAME_SOP v2.5` references are baseline provenance, not current authority.
- `GAME_SITE_STARTER v2.6.5` defines this documentation-correction patch line and its `GAME_SOP v2.6.5` compatibility line.
  V2.6.4 is the released and frozen source baseline at tag `starter-v2.6.4`,
  commit `3138778fa4b4cc0f9daa4687a752de99fd1e6d88`, tree
  `a619b438c39c82340d3b5408e51328d0a6f99bce`, and annotated tag object
  `9ab1d55c2a5db9a1af91a2c4ccef2b3b1e98e9fd`. Phase 1C
  implementation evidence and
  the earlier Phase C D1-D3
  technical implementation evidence is recorded separately; it is not final
  Human approval.
- Historical Master Prompt files and Starter 2.0/V2.5/V2.6 reports are
  provenance artifacts. Do not treat those stale references as current Starter
  identity.

`package.json` version `0.1.0` is the inherited private application/scaffold
package metadata version, also recorded at the top level and root package of
`package-lock.json`. This package metadata value does not identify the Starter
release or SOP compatibility line. The historical v2.5.0 proposal already records
`0.1.0`, and the v2.6 Git baseline retains it. The frozen v2.6.2 baseline, the
released v2.6.3 and v2.6.4 baselines, and the v2.6.5 documentation-correction patch
line all keep that metadata unchanged.

The current package carries forward the approved Starter v2.5.0 scope in
[`docs/STARTER_V2.5_CHANGE_PROPOSAL.md`](docs/STARTER_V2.5_CHANGE_PROPOSAL.md)
while preserving the Starter 2.0 architecture baseline recorded in
[`docs/STARTER_2.0_ARCHITECTURE_PROPOSAL.md`](docs/STARTER_2.0_ARCHITECTURE_PROPOSAL.md).

## Requirements and first build

This Phase A candidate adds PP-02 production residue safety. The unadopted
example intentionally fails `validate` and `build`: replace the example brand,
domain, enabled inventory copy/sources, About copy, setup article and SVG logo
before producing final output. `build:evidence` can warn on ordinary sample
branding/domain only; setup instructions and legal template text still fail.
See [the PP-02 adoption contract](docs/PP02_PRODUCTION_RESIDUE.md).

- Node.js `22.22.0` from `.nvmrc`
- npm with lockfile support

```bash
nvm use
npm ci
npm run validate
npm run check
npm run build
npm run preview
```

The production output is `dist/`. `npm run build` validates configuration,
content, facts, and media; generates static Astro pages; reconciles every HTML
route exactly with Runtime Page Inventory; creates the Pagefind index; and audits
generated HTML, links, SEO, sitemap, robots, media markup, and size budgets.
Pagefind 1.5.2 output is normalized by removing only exact, proven-unreferenced
stock UI files; the 800,000 B ceiling applies to the complete normalized
contract-required runtime/index payload, while the raw total remains diagnostic.

When fresh rendered output is needed solely for Human review while the only
final-readiness blocker is a contract-valid Human/visual `PENDING`, run:

```bash
npm run build:evidence
```

This output is **NOT FINAL** and carries
`dist/EVIDENCE_BUILD_NOT_FINAL.json`. Human review is required. The command
does not approve or mutate lifecycle decisions; `npm run build` remains the
fail-closed canonical final build and must produce output without that marker.

## Practical architecture

| Authority | Owns | Does not own |
| --- | --- | --- |
| `src/data/page-inventory.json` | Page existence, route, publication state, visibility, indexability, titles, relationships, source basis | Article body, media placement, FAQ, layout |
| `game.config.ts` | Brand/site values, feature flags, navigation groups/order, featured page IDs | Duplicate routes or publication state |
| `src/content/**` | Narrative guide/meta/news content and optional authored FAQ | Page identity or publishing decisions |
| `src/data/facts/**` | Validated patch-sensitive structured facts and provenance | Routes or presentation labels |
| `src/data/media/media.json` | Local image/local video/YouTube assets and `hero`/`gallery`/`trailer` page mappings | Page publication or arbitrary layout slots |
| `src/config/ads.ts` | Disabled-by-default monetization decision, typed semantic placements, public slot identity, and optional known dimensions | Page-type policy, provider registry, private credentials, or Runtime Page Inventory |
| `src/styles/theme.css` | Game-wide palette and page-family role tokens | Arbitrary per-component family keys |
| Components | Presentation of already resolved data; `AdSlot.astro` expresses where and `ProjectAd.astro` is the project-owned provider edge | A second publication database, automatic ad placement, or provider orchestration |

The implementation uses:

- Astro 7 static output, strict TypeScript, Zod, and Tailwind CSS 4;
- MDX Content Collections for guides, meta pages, and patch/news articles;
- React Islands only for Pagefind search, entity filtering, calculators, and
  planners;
- Pagefind for local static search, with no external search service;
- deterministic feature filtering and exact output reconciliation.

## Adopt for a real game

1. Record the source Starter commit, `GAME_SOP v2.6.5` package/reference, and
   current Master Prompt version in the new project's brief.
2. Complete the SOP research and human planning gates before changing page
   scope. The Starter does not decide whether a game needs heroes, tier lists,
   maps, tools, or any other content family.
3. Replace the example brand, canonical HTTPS URL, SEO defaults, social handle,
   feature flags, grouped navigation, and featured IDs in `game.config.ts`.
4. Review `src/data/page-inventory.json`. Add each approved route there before
   writing its content or data.
5. Add narrative content under `src/content/`, facts under `src/data/facts/`,
   tools under `src/data/tools/`, and reviewed local media under `public/media/`.
6. Replace the neutral fallback palette in `src/styles/theme.css` after game
   visual identity research. Footer colors derive from shared theme tokens.
7. Leave `src/config/ads.ts` disabled unless monetization is explicitly approved.
   When enabled, configure each semantic placement, implement the single
   project-owned `ProjectAd.astro` provider edge, and verify the provider's
   slot/key/bootstrap multiplicity rules.
8. Run the complete workflow in
   [`docs/QA_CHECKLIST.md`](docs/QA_CHECKLIST.md) before any deployment.

Projects upgrading from Starter 1.0 or a 2.1-based copy should follow
[`docs/STARTER_2.0_MIGRATION.md`](docs/STARTER_2.0_MIGRATION.md).

## Presentation contracts

### Grouped navigation

`navigation.groups` stores grouping and order using Page IDs. Runtime Page
Inventory remains the source of routes, titles, and enabled state.
`src/core/site-data.ts` is the sole Page ID → enabled page resolver and exports
`resolvedNavigationGroups`; desktop/mobile components only render that result.

The legacy `navigation.primaryPageIds` input is accepted as a migration adapter
and normalized to childless groups. New projects should author only
`navigation.groups`.

### WikiArticle and EditorialArticle

Guide articles use `WikiArticle`: player-facing dates, optional media and Quick
Facts, body-renderer H2/H3 TOC, optional FAQ, Related Pages, and Sources &
Verification. Internal Priority, Confidence, Search Signal, tags, and editorial
briefs are not rendered.

`EditorialArticle` remains the deliberate layout for meta/tier and patch/news
content. It keeps player-friendly publication/verification information without
reintroducing research-report metadata.

### Homepage heading

The homepage H1 uses `homepage.displayHeading` when it is explicitly authored
and non-blank. If omitted, it falls back to `brand.name`. The default Starter
config intentionally omits `displayHeading`; projects should author their real
game-facing heading during adoption. `brand.tagline` remains supporting copy,
not an automatic H1.

When homepage hero media is absent, the desktop hero renders as an intentional
single-column layout. When hero media exists, the desktop split layout remains.
Mobile remains one column in both states.

### Media contract

The Starter v2.6.5 documentation-correction patch line keeps the existing
fixed-placement media implementation and V2.6.1 Phase C D1-D3 media-readiness
projection. It
supports `docs/MEDIA_DECISION_TABLE.md`, legacy root `MEDIA_DECISION_TABLE.md`
compatibility, duplicate-authority fail-closed validation, exact lifecycle enum
validation, Runtime Page Inventory identity resolution, and deterministic
SOP-derived readiness signals. The media runtime still supports only:

- local image files under `public/media/`, referenced as `/media/...`;
- validated 11-character YouTube IDs rendered through `youtube-nocookie.com`;
- local `.mp4` and `.webm` files under `public/media/`, with optional local
  poster images.

Native local videos render with controls, `playsinline`, `preload="metadata"`,
and the same 16:9 responsive wrapper as YouTube embeds. The manifest provides
only `hero`, `gallery`, and `trailer` placements. Guide and entity articles may
render all fixed placements; hubs render hero media only. Remote images,
arbitrary iframes, uploads, dimensions/crops, a placement DSL, DAM, CDN
abstraction, transcoding, and image/video processing are not supported. Every
asset requires an HTTPS `sourceUrl` for provenance; that URL does not prove
legal reuse rights.

Build audit may emit a non-blocking advisory for unusually large local video
files. The advisory is an implementation-local heuristic, not a universal byte
limit; project budgets and observed delivery behavior remain authoritative.

See [`docs/media/README.md`](docs/media/README.md) for the exact contract.

### Page-family accents

The family key is the controlled Runtime Page Inventory `module`. BaseLayout
exposes that value and `src/styles/page-families.css` maps it to
`--page-accent`. Game-specific color values belong only in `theme.css`; an
unconfigured family falls back to `--color-accent`.

Components must not invent keys such as `beginner-guides`, `early-game`, or
`hero-detail`.

### Wiki Portal homepage and FAQ

The homepage has a fixed portal composition. It derives featured/start pages,
categories, systems, updates, Browse All, and optional media from existing
authorities; empty sections render nothing. It is not a Homepage CMS or block
builder.

FAQ items are optional authored Content fields. They are visible when supplied,
render nothing when empty, do not enter Page Inventory, and currently emit no
FAQ JSON-LD. QuickFacts is a presentation primitive: projects map validated
Fact values to `{ label, value }` without adding display labels to Fact schemas.

### Monetization seam

The V2.6.3 Phase 1C implementation adds a narrow provider-neutral boundary:
`src/components/ads/AdSlot.astro` accepts a typed semantic placement,
`src/config/ads.ts` decides whether that placement is configured and enabled,
and `src/components/ads/ProjectAd.astro` is the only project-owned provider
markup/bootstrap edge. Pages decide **where**; the project edge decides **how**;
the independent ads config decides **whether**. Ads do not enter
`game.config.ts`, Runtime Page Inventory, the media manifest, or BaseLayout.

The shipped config is `enabled: false` with no placements, and the shipped
provider edge is a no-op. The dormant homepage `home-primary` call therefore
emits no wrapper, provider container, request/bootstrap reference, styling, or
reserved space. A locally disabled or absent placement has the same literal
zero-output behavior. `before-footer` is a canonical semantic name available
for explicit project composition; it is never injected automatically.

Each enabled definition requires a non-empty project/provider instance identity
and browser-visible public slot identity. Positive width and height supplied
together reserve responsive aspect-ratio space; unknown dimensions create no
universal minimum height. Duplicate enabled instance identities and malformed
dimensions fail deterministic validation. The project provider root must expose
its configured `data-ad-instance`. Externally loaded bootstrap resources are
audited by normalized script `src`, including an unmarked duplicate when the
resource is identified by the provider edge. Inline bootstrap code has no
resource URL, so it must expose the minimum stable `data-ad-bootstrap` identity.
A shared bootstrap is emitted once per page rather than once per placement.

Only public client identifiers belong in this seam. API keys, account tokens,
admin credentials, signing material, and other private secrets must stay out of
`ads.ts`, `AdSlot.astro`, `ProjectAd.astro`, and generated browser output. A
provider requiring private server/API integration needs separate architecture;
do not extend this client seam into a secret-management or provider platform.

## Feature flags

All flags are explicit in `game.config.ts`: `guides`, `heroes`, `weapons`,
`items`, `maps`, `tierLists`, `news`, `search`, `calculator`, and `planner`.

A disabled feature removes its owned pages from the enabled catalog and every
derived surface: routes, grouped navigation, homepage collections, related
links, sitemap, Pagefind, and generated HTML. Enabling an entity or tool without
its required validated data fails validation rather than publishing a partial
module.

Entity-family definitions live in `src/data/entity-modules.ts`. Extending the
supported families requires an explicit reviewed implementation and tests; this
is not a plugin system.

## Documentation

- [Historical Starter v2.5.0 change proposal](docs/STARTER_V2.5_CHANGE_PROPOSAL.md)
- [Starter 2.0 architecture baseline](docs/STARTER_2.0_ARCHITECTURE_PROPOSAL.md)
- [Content and data boundaries](docs/CONTENT_AND_DATA_GUIDE.md)
- [Starter 1.0 → 2.0 migration](docs/STARTER_2.0_MIGRATION.md)
- [Release QA checklist](docs/QA_CHECKLIST.md)
- [Patch workflow](docs/PATCH_WORKFLOW.md)
- [Deployment boundary](docs/DEPLOYMENT.md)
- [Starter 2.0 release audit](docs/STARTER_2.0_RELEASE_AUDIT.md)

## Commercial-use boundary

The Starter architecture is suitable for commercial projects, but it grants no
rights to a game's name, logo, screenshots, official art, APIs, third-party wiki
content, scraped data, or community submissions. The adopter remains responsible
for factual review, licenses, platform terms, attribution, privacy, analytics,
advertising, legal copy, and the final human release decision.

No analytics, telemetry, accounts, database, CMS, ad scripts, or automatic
content/media selection are included by default.
