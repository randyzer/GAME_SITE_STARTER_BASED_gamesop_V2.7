# Content and Data Guide

The Starter v2.6.5 documentation-correction patch line separates publication decisions,
authored narrative, structured facts, visual assets, configuration, theme, and
presentation. Keep each value in its owning layer; do not turn Runtime Page
Inventory into a whole-page CMS. V2.6.2 Phase 1C preserved the Phase C D1-D3
technical hardening in this Starter for media readiness projection, public-safe
source rendering, and Node 22 runtime alignment. Its `GAME_SOP v2.6.2` context
is historical baseline provenance, not current methodology authority.

## Authority boundaries

| Layer | Authority | Owns |
| --- | --- | --- |
| Page Inventory | `src/data/page-inventory.json` | Page existence, route, page type/module, feature owner, publication/visibility/indexability, titles/descriptions, dates, relationships, source basis |
| Config | `game.config.ts` | Brand/site/SEO defaults, feature flags, navigation grouping/order, homepage featured ordering, optional authored homepage heading |
| Content | `src/content/**` | Narrative article body and optional authored FAQ |
| Fact Layer | `src/data/facts/**` | Validated patch-sensitive entity facts and their provenance |
| Tool data | `src/data/tools/**` | Validated calculator/planner inputs and formulas |
| Media Manifest | `src/data/media/media.json` | Asset records and fixed `hero`/`gallery`/`trailer` placement references |
| Theme | `src/styles/theme.css` | Game-wide palette and controlled module role tokens |
| Presentation | Astro components and targeted CSS | Rendering already resolved data |
| SOP/Human review | `GAME_SOP v2.6.5` and project artifacts | Coverage decisions, research quality, factual/legal/visual approval, release gates |

The dependency direction is one way: presentation consumes these authorities.
Media, content, facts, homepage sections, and components cannot create or publish
a page.

## Runtime Page Inventory: publication SSOT

Create or edit `src/data/page-inventory.json` before implementing a route. Each
row owns the stable page ID and URL plus its publication facts. The enabled Page
Catalog is derived from:

- `visibility === "public"`;
- `publicationStatus === "published"`;
- no feature owner, or an enabled owner in `game.config.ts`.

That catalog drives routes, navigation resolution, homepage collections,
related links, sitemap, Pagefind eligibility, and exact output reconciliation.
Draft, scheduled, archived, private, unlisted, and feature-disabled pages cannot
leak into those public surfaces.

Do **not** add any of the following to Inventory:

- article body or layout blocks;
- `heroImage`, gallery items, YouTube IDs, captions, or media slots;
- FAQ questions/answers;
- component state, mobile/desktop image variants, image dimensions/crops;
- presentation-only QuickFacts labels;
- arbitrary page-family/color keys;
- homepage section definitions.

Inventory `priority`, `confidence`, tags, search keyword, review flags, and
evidence notes remain useful internal publication data. Player-facing components
must not render them as research-dashboard metadata.

## Config: grouping, order, and feature decisions

### Grouped navigation

New projects author Page IDs only:

```ts
navigation: {
  groups: [
    { label: "Home", pageId: "home" },
    {
      label: "Guides",
      pageId: "hub.guides",
      children: ["guide.getting-started", "guide.progression"],
    },
  ],
},
```

Config owns the group label and ordering. Inventory owns each page's route,
title, existence, visibility, and publication state. Children are Page IDs, not
duplicated `{label,url,title,state}` records.

`src/core/site-data.ts` is the sole Navigation Page ID → enabled page resolver.
It exports `resolvedNavigationGroups`; Header, DesktopNav, and MobileNav only
render that resolved shape. Invalid, draft/private/unlisted, or feature-disabled
references fail validation. An authored `children: []` becomes a childless group
and produces no empty dropdown.

A Page ID may appear only once inside the `navigation.groups` primary/secondary
tree. This does not prevent the same page from appearing in Footer, Homepage,
Related Pages, article links, sitemap, or search results. Footer is outside the
navigation tree.

The legacy `navigation.primaryPageIds` form is accepted as a migration adapter:
schema parsing converts each ID into a childless group. Do not author both forms,
and use `groups` for all new work.

### Homepage featuring

`homepage.featuredPageIds` remains the only featured ordering field. Each ID
must resolve through the enabled catalog or validation fails. Do not add a
second `featuredGuides`, section array, route list, or homepage publication
model.

`homepage.displayHeading` is optional. If supplied, it must contain non-blank
text and becomes the homepage H1. If omitted, the homepage H1 falls back to
`brand.name`. The default Starter example intentionally omits this field so
adopters replace identity at the project edge instead of inheriting polished
generic copy. Do not use `brand.tagline` as the H1 unless the project explicitly
authors the same text as `displayHeading`.

## Content: narrative and optional FAQ

Editorial collections are:

- Guides: `src/content/guides/`
- Tier/meta: `src/content/meta/`
- Patch/news: `src/content/news/`

The matching Inventory row must have the correct `contentRef.collection` and
`contentRef.slug`. An MDX guide keeps frontmatter small:

```md
---
pageId: guide.example-topic
faq:
  - question: What should I do first?
    answer: Complete the first objective, then follow the route in this guide.
---

Player-facing narrative starts here.

## First objective

Explain the actual task.
```

FAQ is optional, explicitly authored, and visible. An absent or empty list
renders nothing. FAQ never enters Inventory and the current implementation does not generate
questions or FAQ JSON-LD.

Guide pages use `WikiArticle`. Its Table of Contents consumes only H2/H3 records
returned by the existing content renderer. H1, H4+, FAQ, QuickFacts, Sources,
Related Pages, navigation, and component-owned headings are excluded without a
DOM crawler, post-render parser, or title blacklist.

Meta/tier and patch/news pages retain `EditorialArticle`. It is the intentional
editorial variant, not the default guide layout. Both article families keep
Sources & Verification and player-safe update information while hiding internal
Priority, Confidence, Search Signal, tags, and editorial briefs.

Empty optional collections are intentional. Do not add filler content merely to
remove Astro's empty-glob message.

## Fact Layer and QuickFacts

Entity fact files live at:

- `src/data/facts/heroes.json`
- `src/data/facts/weapons.json`
- `src/data/facts/items.json`
- `src/data/facts/maps.json`

The module/entity/route/parser relationship is registered explicitly in
`src/data/entity-modules.ts`. Concrete schemas and route presenters remain
family-specific; this is not a plugin system or universal entity renderer.

Do not create an empty production file for a disabled entity module. When a
module is enabled, its complete file must pass `src/data/schemas/facts.ts` and
provide the required source/date/patch fields. Facts do not create routes:
reviewed Hub/database/detail Inventory rows and matching entity references must
exist separately.

`QuickFacts` is only a presentation primitive. Map validated values at the
presentation edge:

```ts
const quickFacts = [
  { label: "Developer", value: validatedGameFacts.developer },
  { label: "Release date", value: validatedGameFacts.releaseDate },
];
```

Do not add `displayLabel` or homepage-specific copies of fact values to the Fact
schema. If no applicable facts exist, omit the section.

## Media Manifest: visual placement, not publication

The Starter v2.6.5 documentation-correction patch line keeps the existing media
contract and Phase C D1-D3 media-readiness projection. It supports
`docs/MEDIA_DECISION_TABLE.md` for new projects, root `MEDIA_DECISION_TABLE.md`
for legacy compatibility, duplicate-authority fail-closed validation, exact
lifecycle enum validation, Runtime Page Inventory identity resolution, and
deterministic SOP-derived readiness signals. Runtime media support remains
limited to local images, local MP4/WebM video, optional local video posters, and
YouTube IDs only. Local files live under `public/media/` and use safe
`/media/...` paths. YouTube video `src` is a validated 11-character ID, not an
iframe URL.

```json
{
  "assets": [
    {
      "id": "opening-route",
      "type": "image",
      "src": "/media/opening-route.webp",
      "alt": "The marked path from the camp to the first objective",
      "caption": "Follow the north path after leaving camp.",
      "sourceUrl": "https://example.com/original-source"
    },
    {
      "id": "official-trailer",
      "type": "video",
      "src": "abcdefghijk",
      "alt": "Official game trailer",
      "sourceUrl": "https://www.youtube.com/watch?v=abcdefghijk"
    },
    {
      "id": "local-trailer",
      "type": "video",
      "src": "/media/local-trailer.mp4",
      "poster": "/media/local-trailer-poster.webp",
      "alt": "Local gameplay trailer",
      "sourceUrl": "https://example.com/original-source"
    }
  ],
  "pages": [
    {
      "pageId": "guide.example-topic",
      "hero": "opening-route",
      "gallery": ["opening-route"],
      "trailer": "official-trailer"
    }
  ]
}
```

The three fixed placements are the complete current vocabulary. A mapping may
reference an existing unpublished page for future authoring, but it cannot
publish that page, enable its feature, create a route, or change indexability.
Every mapped or unmapped registered local image, local video, and poster must
exist and pass validation.

Guide/entity article renderers may consume hero, gallery, and trailer. Hub pages
consume hero media only in the current implementation; gallery and trailer are not automatically
rendered on hubs. `StaticWikiPage.astro` is a constrained reusable renderer for
explicit page inputs and fixed placements. It does not own routing,
publication, navigation, indexability, or Page Inventory fields.

Remote image `src`, arbitrary iframes, uploaded video services, dimensions/crops,
mobile/desktop variants, processing pipelines, transcoding, a generic placement
DSL, DAM, and CDN abstraction are unsupported. Build audit may print a
non-blocking advisory for unusually large local videos; this is an
implementation-local heuristic, not a universal size limit. `sourceUrl` records
provenance only; it is not proof of copyright or reuse permission. Human/SOP
review owns rights, privacy, appropriateness, and visual quality.

See `docs/media/README.md` for path, alt, caption, YouTube, and validation
details.

## Theme and page-family identity

Game-specific palette values belong in `src/styles/theme.css`. Starter v2.6.2
defaults are intentionally neutral and installable, not a shippable generic
brand identity. Footer colors and borders derive from shared theme tokens so a
project theme can replace them naturally. The family key comes only from the
controlled Inventory `module` value:

```text
page.module → body[data-page-family] → page-families.css → --page-accent
```

Supported role mappings cover `core`, `guides`, `heroes`, `weapons`, `items`,
`maps`, `tierLists`, `news`, `search`, and `tools`. A missing dedicated role
falls back to `var(--color-accent)`. Components consume `--page-accent`; they do
not create keys from page type, route, tag, cluster, or content label.

If a future reviewed change adds a new Inventory module, update the controlled
schema, token/fallback decision, selector, and tests together.

## Wiki Portal homepage

`src/pages/index.astro` owns a fixed composition:

1. Game Hero
2. Quick Facts
3. Start Here
4. Browse by Category
5. Featured Guides
6. Important Systems
7. Latest Updates
8. Screenshot / Trailer
9. FAQ / Common Questions
10. Browse All

The pure `home-model.ts` derives collections from the enabled Page Catalog,
existing featured IDs, and optional Fact/Content/Media input. Empty sections
render nothing, and deterministic de-duplication only changes homepage
presentation. It never hides a page from the actual site.

Homepage hero layout is stateful but not schema-driven: with hero media, desktop
uses the split media/copy layout; without hero media, desktop uses a deliberate
single-column copy layout. Mobile remains one column in both cases.

Do not introduce `homepage.sections`, a block registry, per-card routes, a
Homepage CMS, popularity claims without analytics, or a second category list.

## Tools

Use one `src/data/tools/<route-slug>.json` file per enabled tool. Calculator
formulas are declarative operation trees; arbitrary JavaScript and `eval` are
not supported. Planner slots/options are explicit and share state only through
the URL fragment. See `src/data/tools/README.md` and
`src/data/schemas/tools.ts` for the exact contract.

## Validation sequence

Use the pinned Node version and locked dependencies:

```bash
nvm use
npm ci
npm run validate
npm run check
npm run build
```

`validate` checks deterministic source/config/data relationships. `check` adds
Astro diagnostics and the complete Vitest suite. `build` validates again,
generates static routes, reconciles exact output, creates Pagefind, and audits
generated HTML, internal links, sitemap, robots, media markup, and budgets.

Passing automation does not establish factual correctness, content usefulness,
media quality, legal rights, competitive coverage, or final responsive visual
quality. Complete the human checks in `docs/QA_CHECKLIST.md` before release.
