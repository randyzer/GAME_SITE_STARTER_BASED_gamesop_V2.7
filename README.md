# GAME_SITE_STARTER_BASED_gamesop_V2.7 — V2.7 Candidate

## V2.7 GitHub checkout

- SOP: [randyzer/GAME_SOP_V2.7](https://github.com/randyzer/GAME_SOP_V2.7)
- Master Prompt: [randyzer/GAME_CODEX_MASTER_PROMPT_V2.7](https://github.com/randyzer/GAME_CODEX_MASTER_PROMPT_V2.7)
- Starter: [randyzer/GAME_SITE_STARTER_BASED_gamesop_V2.7](https://github.com/randyzer/GAME_SITE_STARTER_BASED_gamesop_V2.7)

Clone the three repositories into the same parent directory using these explicit
local names to preserve the sibling paths used by Starter and Prompt.

```sh
git clone https://github.com/randyzer/GAME_SOP_V2.7.git GAME_SOP_V2.7
git clone https://github.com/randyzer/GAME_CODEX_MASTER_PROMPT_V2.7.git GAME_CODEX_MASTER_PROMPT_V2.7
git clone https://github.com/randyzer/GAME_SITE_STARTER_BASED_gamesop_V2.7.git GAME_SITE_STARTER_BASED_gamesop2.7
```

Cross-repository relative document links assume this local layout. Use the SOP
GitHub link above when reading it online. These repositories publish the V2.7
Candidate source; pushing commits does not grant product or release acceptance.

## Current adoption entry

This is a working V2.7 Candidate, not a released or production-approved package.
Use the reviewed working source, including uncommitted files, rather than HEAD
alone. Record the selected Starter, SOP and Master Prompt identities together.
The inherited release/tag history below is provenance, not current acceptance.

- Starter supplies the reusable technical Core and existing components.
- SOP owns the sole Product Contract and the project/adoption method.
- Master Prompt enforces that method; it does not create another authority.

Follow the [current SOP execution interpretation](../GAME_SOP_V2.7/docs/NEW_GAME_SITE_SOP_v2.7.md#v27-current-execution-interpretation)
and [this QA checklist](docs/QA_CHECKLIST.md#v27-evidence-levels-and-input-preflight).
Reuse one Core; put game choices in the existing Config, Inventory, content,
facts/tools, theme and Media Manifest inputs. Verify first-party game sources
before writing factual claims. Source access, publication, update and recorded
patch/version are distinct; an access date never proves game currency or rights.

Game Adaptation is a lightweight project decision method, not runtime config.
Wiki / Hub, Task Guide and Media-rich Article use direct existing MDX/component
composition. An answer, ordered steps or manual next action can be ordinary
content; dedicated QuickAnswer/Steps/NextStep components are not implied.
Do not add a Pattern ID, registry, dispatcher, page builder or duplicated authority.

Qualify the unchanged default source separately from an adopted project's inputs.
Default-fixture failures in an adopted copy remain FAIL and require scoped
diagnosis; source-only PASS never becomes adopted `npm run check` PASS. Final
adoption still requires its own validate/check/canonical build and applicable
independent gates. `build:evidence` produces marked non-final output only.

A reserved `.example` origin is an evidence identity, not an owned/live domain.
Check actual preview links separately: absolute canonical-origin breadcrumbs do
not prove usable local navigation. Production needs an authorized owned origin
and exact-build canonical, sitemap, robots and live-link checks.

Use the pinned runtime and lockfile with `npm ci` in a clean owned copy. Temporary
external `node_modules` links are development aids, not deliverable dependencies;
exclude modules, secrets, caches and generated output from a source package.
Human visual/game recognition, media/no-media suitability, rights, operator/legal,
applicable advertising, assembled accessibility and representative real Safari
review remain independent obligations. A bounded technical build is not a
commercially complete site or release permission.

## Inherited V2.6.5 documentation-correction patch line

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

## V2.7 WS-02 development lineage

This working-tree candidate is not a V2.7 release. Development branch
`v2.7/evolution` inherits accepted A3 commit
`b067e8d4050478072f25a1dc78a8526cdd128cfd`, tree
`1df0ade30b1eaf51a76820c8d8b83337786f0dc1`, preserving S1/A1/A2/A3.
The historical release provenance above remains intact. The V2.7 Product Contract
is owned by GAME_SOP at `docs/COMMERCIAL_GAME_SITE_PRODUCT_CONTRACT_V2.7.md`,
SHA-256 `1ff2bd01a089975c6b22bff48ca71faffe2be9c710d0123afd3ae47acc7ac24c`.
Changed working-tree files need exact hashes alongside the inherited HEAD.

Game Atlas is an intentionally unadopted example. Local reusable-Core verification:

```bash
npm run check
npm run verify:unadopted-final
npm run verify:adopted-final
```

The first verifier asserts that isolated default validation and final build fail
specifically because of PP-02. Its success proves expected rejection. The second
uses the existing Field Notes neutral adoption in a disposable complete project,
running actual `npm run validate`, `npm run check` and `npm run build`; it verifies
no evidence marker or unapproved legal routes. Both clean up their copies and
leave the canonical source untouched. This is synthetic technical evidence,
not real-game, human, media-rights or legal approval. AX-01 browser evidence
remains pending WS-06A; WS-03D search obligations and REF/project adoption remain
separate. CI runs the same two gates after the root check.

Real projects still require their own adopted `validate`, `check`, canonical
final `build` and applicable independent human/browser gates. `build:evidence`
cannot satisfy final acceptance. No new dependency is introduced by these tools.

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

1. Record the selected V2.7 Starter working source, exact SOP package/reference,
   and Master Prompt identity in the new project's brief, including changed-file
   hashes alongside inherited commits. Do not infer a release from a filename.
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

### Site-wide semantic visual roles

`game.config.ts` may explicitly select the supported `visualRoles` as optional
preset/compatibility helpers, not a long-term Game Adaptation model:

```ts
visualRoles: {
  font: "interface",       // editorial | interface
  density: "compact",     // comfortable | compact
  shape: "soft",          // square | soft
  state: "quiet",         // lifted | quiet
},
```

Omitting the whole object preserves the existing `editorial / comfortable /
square / lifted` fallback. An authored object must specify all four roles;
unknown values, partial objects and arbitrary CSS/font/unit/override fields are
rejected. The config remains unconfigured in this Starter. Fallback compatibility
is not project approval of game identity or visual fidelity.

`src/core/theme-roles.ts` resolves validated choices to four immutable identifiers.
BaseLayout binds them on `html[data-theme-*]`; `theme.css` owns their semantic
font, density, shape and decorative hover tokens, and `global.css` consumes those
tokens. Fonts use local/system stacks; no remote font loading is added. Compact
controls stay at least44px; quiet removes decorative lift/shadow while retaining
hover feedback. Focus visibility, current/open semantics, keyboard behavior and
reduced-motion safeguards cannot be configured through these roles.

`body[data-page-family]` still comes only from Inventory `module` and
`page-families.css` still maps only `--page-accent`. Roles are site-wide project
choices, never inferred from route, page type, genre, name or logo. A real game
needs recorded visual evidence, a decision owner and later human visual review;
a valid role object or synthetic browser profile does not supply that evidence.

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

## Core browser evidence (WS-06A)

The dev-only `npm run check:browser` verifies 47 required cases against one final-built disposable Field Notes adoption using real Chromium, Firefox and WebKit. Install pinned dependencies and `npm exec -- playwright install chromium firefox webkit` first. See [Core browser evidence](docs/CORE_BROWSER_EVIDENCE.md) for matrix, Contract input, evidence output and fail-closed behavior. This adds to root check and both WS-02 adoption gates. It proves Core technical behavior only; manual visual/contrast, composed pages, real-game adoption and release remain separate. Browser results never populate capability outcomes automatically.


## V2.7 WS03D search boundary

This bounded search slice keeps `features.search` as the sole technical activation flag. The Core `SearchProvider` interface returns public `SearchResult[]`; completed outcomes distinguish results, empty and error. Pagefind remains the current implementation behind `pagefind-search-adapter.ts`, including its existing first20-hit and safe local result normalization. The UI owns form/history, request identity, loading and rendering; idle does not require provider loading and says “Local site search,” never claiming an unavailable index is online. Older requests cannot overwrite newer submissions.

Pagefind1.5.2, the800000-byte normalized payload budget, required artifact contract and optional UI deletion policy remain fixed. Optional UI reference safety inspects both finite runtime source files: SearchIsland and the Pagefind adapter. References in either file block normalization. No alternate provider, remote service, ranking feature, analytics or query logging is introduced.

Each adopting project must record its search decision outside Core config:

- Decision: ENABLED or DISABLED.
- Rationale and corpus/task basis, with a named decision owner and evidence reference.
- The technical `features.search` value must agree with that decision. No duplicate activation boolean and no invented corpus-size claims.
- Enabled search requires actual result/empty/error browser evidence and useful local results; a working provider alone does not prove that search should be enabled.
- Disabled search requires no search route/UI and no navigation targeting the excluded page. Pagefind build artifacts need not disappear in this slice.

Mechanism/state evidence does not establish ranking quality, real-player demand,
corpus usefulness or project decision appropriateness. Actual project decisions
belong to Adaptation/Acceptance. Recorded dates/version and dynamic-label
provenance retain separate truth requirements. Applicable Safari, assembled
accessibility, Human and release decisions require their own evidence; a working
search mechanism does not promote capability outcomes.
