# GAME_SITE_STARTER V2.7 Candidate QA Checklist

Use this checklist after changing config, Runtime Page Inventory, content,
facts, tools, media, theme, dependencies, or presentation components.
V2.6.5 defines the lifecycle-state corrective patch line.
Release status is determined by the repository's authoritative Git refs and annotated release
tag, not by lifecycle prose in this document. It preserves the released and frozen V2.6.4
source baseline at tag `starter-v2.6.4` and commit
`3138778fa4b4cc0f9daa4687a752de99fd1e6d88`,
including the V2.6.2 Phase 1C Pagefind and fresh-evidence contracts and the
approved provider-neutral monetization seam. This checklist covers the
deterministic checks and still preserves the Human release gates.

Automated checks establish deterministic structural correctness. They do **not**
prove that content is useful or accurate, that media is visually appropriate,
or that the operator has legal reuse rights. Human review remains a release
gate.

## V2.7 evidence levels and input preflight

Follow the [current SOP interpretation](../../GAME_SOP_V2.7/docs/NEW_GAME_SITE_SOP_v2.7.md#v27-current-execution-interpretation).
Candidate is not release identity; inherited V2.6.5 Git provenance above remains
historical. Select checks by changed behavior, not by temporary workstream state.

| Level | Apply this checklist as |
| --- | --- |
| Ordinary slice | Exact source + allowed diff + targeted positive/negative checks; `npm run check` for code/behavior changes; relevant browser only. Prose-only changes use document/diff checks. Reuse still-valid unchanged evidence; no routine all47/all41/synthetic references/workspace-wide hashes. |
| Workstream / adoption TECH | Full applicable check and actual input validate/build/output audit; representative browser surfaces where relevant; independently reviewed scoped evidence and explicit failures/missing coverage. |
| Final product / release | Complete applicable final pipeline and all remaining release checklist, browser matrix/real Safari, Human visual/rights/legal/operator/ads, REF/adoption,41/41/delta and triad compatibility requirements. |

- [ ] Inventory pageId/route/trimmed case-insensitive primaryKeyword values are unique across all records; title20–65 and description50–170 characters follow the existing schema, not new limits.
- [ ] Enabled pages, features, contentRef and actual content agree; no stale example/source-template output or fabricated game facts.
- [ ] Published pages have publishedAt; updatedAt >= publishedAt. Sources accessedAt projects to sourceCheckedAt, never verifiedAt; patch/version remains separate. No generic live-state input is required.
- [ ] Canonical configuration, actual preview URL and final authorized owned origin are distinguished. Reserved `.example` is evidence-only; absolute breadcrumbs are actually checked, not assumed to return to the local preview.
- [ ] Existing Manifest and unique Media Decision Table agree with rendered media/no-media state; sourceUrl/rightsRef never imply rights or Human suitability approval.
- [ ] Default-source/synthetic qualification is identified separately from the actual adopted copy. Default-fixture failures remain FAIL, not an exemption or source-only PASS; final adopted `npm run check` remains required.
- [ ] Every bounded command has its actual exit/warnings/errors. `build:evidence` and its marker never satisfy canonical final `npm run build` or Human acceptance.
- [ ] Clean-copy reproduction uses the pinned runtime and lockfile with `npm ci`; temporary dependency links are not delivery artifacts. Preserve relevant raw evidence without secrets, caches or modules.

The full raw browser matrix and separate Safari closure policy below remain
strict when their browser/release scope is being evaluated. Missing Safari blocks
applicable AX/assembled/release acceptance, not unrelated non-browser work.
No disabled feature, no-media record, minimal guide or build success establishes
full commercial coverage, game recognition, operator ownership or release PASS.

## Record provenance first

- [ ] Record the source Starter commit and working branch.
- [ ] Record the exact selected V2.7 SOP package/reference; retain predecessor provenance separately.
- [ ] Record the current Master Prompt version.
- [ ] Record any known version mismatch instead of silently rewriting upstream
      documents.
- [ ] Confirm the historical v2.5 scope authority is
      `docs/STARTER_V2.5_CHANGE_PROPOSAL.md`.
- [ ] Confirm the working tree contains no unrelated or secret files.

## AUTOMATED / DETERMINISTIC gate

Run with Node `22.22.0` from `.nvmrc` and the committed lockfile:

```bash
nvm use
npm ci
npm run validate
npm run check
npm run build
git diff --check
```

Do not continue to release review if any command exits non-zero.

### Configuration and publication

- [ ] Zod accepts `game.config.ts`, Inventory, content, facts, tools, and media.
- [ ] Every feature flag is explicit.
- [ ] Page IDs, routes, normalized primary keywords, content references, media
      IDs, and page media mappings satisfy their uniqueness rules.
- [ ] Enabled Catalog contains only public, published pages whose feature owner
      is enabled.
- [ ] Page Inventory remains the publication SSOT and contains no media, layout,
      slot, or route-level visual decision fields.
- [ ] No broad catch-all route such as `src/pages/[...path].astro` exists.
- [ ] Draft/private/unlisted/scheduled/archived/feature-disabled pages do not
      leak into routes, navigation, homepage, related links, sitemap, or search.
- [ ] Enabling an entity module without its required valid fact file fails.
- [ ] Enabling a tool page without its required valid definition fails.

### Navigation

- [ ] `navigation.groups` references only existing enabled Page IDs.
- [ ] Navigation-tree Page IDs are unique inside the primary/secondary tree.
- [ ] `children: []` resolves as a childless group with no empty dropdown.
- [ ] `src/core/site-data.ts` remains the sole Page ID → enabled page resolver.
- [ ] Header/DesktopNav/MobileNav consume `resolvedNavigationGroups` without a
      second lookup or publication filter.
- [ ] Legacy `primaryPageIds`, when tested for migration, normalizes to
      childless groups and is not authored together with `groups`.

### Content and player-facing metadata

- [ ] Every enabled editorial Inventory `contentRef` has exactly one matching
      Content entry.
- [ ] Guide pages render through WikiArticle; meta/news retain EditorialArticle.
- [ ] WikiArticle TOC includes only content-renderer H2/H3 headings.
- [ ] FAQ, QuickFacts, Sources, Related Pages, navigation/layout headings, H1,
      and H4+ do not enter the TOC.
- [ ] Public HTML does not expose Priority, internal Confidence, Search Signal,
      tags, editorial briefs, or evidence-ledger UI.
- [ ] Empty QuickFacts and FAQ inputs emit no heading, wrapper, or gap.
- [ ] No FAQ JSON-LD exists unless a separately reviewed implementation reuses
      the exact visible FAQ data.

### Media

- [ ] Asset IDs and page mappings are unique; every referenced asset/page exists.
- [ ] `hero`/`gallery` reference images and `trailer` references a video.
- [ ] Image `src` starts with `/media/`, cannot traverse directories, and maps
      to a real regular file under `public/media/`.
- [ ] Local video `src` starts with `/media/`, uses `.mp4` or `.webm`, cannot
      traverse directories, and maps to a real regular file under
      `public/media/`.
- [ ] Local video posters are optional, local image files only, and fail
      validation when missing or unsafe.
- [ ] Remote image URLs are rejected.
- [ ] Every asset has HTTPS provenance `sourceUrl`.
- [ ] Informative images have meaningful alt text; decorative images use exactly
      `alt: ""` only by intentional human decision.
- [ ] YouTube `src` is an 11-character ID; iframe uses
      `youtube-nocookie.com`, a non-empty title, lazy loading, limited
      permissions, and fullscreen support.
- [ ] Native local video renders with controls, `playsinline`,
      `preload="metadata"`, a 16:9 wrapper, source provenance, and no autoplay.
- [ ] Hub pages render manifest hero media only; they do not automatically
      render gallery or trailer placements.
- [ ] Static wiki media support, if used, accepts explicit page input and fixed
      placements only; it does not own routing or publication.
- [ ] Empty manifest/no page mapping emits no media section or placeholder.
- [ ] A broken media reference fails validation rather than falling back.
- [ ] No build-time media network probe occurs.
- [ ] Any local video size message is an advisory only and is not treated as a
      universal SOP byte limit.

### Theme and homepage

- [ ] Every controlled Inventory module has one reviewed page-family token or
      explicit `--color-accent` fallback mapping.
- [ ] `data-page-family` comes exactly from `page.module`; components do not
      invent family keys.
- [ ] Raw game-specific colors remain in `theme.css`.
- [ ] Starter fallback colors remain neutral and installable, not a shippable
      generic brand identity.
- [ ] Footer colors, borders, muted text, and links derive from theme tokens.
- [ ] Homepage consumes the enabled catalog, existing featured IDs, optional
      Fact mapping, Content FAQ, and Phase B Media only.
- [ ] Homepage H1 uses authored `homepage.displayHeading` when supplied and
      falls back to `brand.name` when omitted; blank values fail validation.
- [ ] The default Starter config omits `homepage.displayHeading`.
- [ ] No polished generic Starter hero slogan is present in rendered HTML.
- [ ] Homepage section order remains fixed code; no block array, section
      registry, Page Builder, or Homepage CMS exists.
- [ ] Homepage de-duplication is deterministic and Browse All contains only
      eligible enabled pages.
- [ ] Empty/minimal data leaves a coherent Hero with no dead anchor, empty
      heading, shell, card, or placeholder.
- [ ] Desktop no-media homepage Hero is a deliberate single-column layout;
      desktop media Hero keeps the split layout; mobile remains one column.

### Monetization seam

- [ ] The shipped `src/config/ads.ts` remains globally disabled with an empty
      placement map unless monetization is explicitly approved for the project.
- [ ] Global disablement, local disablement, an absent placement, and an
      explicitly disabled placement each emit no ad wrapper, provider container,
      bootstrap/request reference, label, background, or reserved space.
- [ ] Pages/components express only typed semantic placement intent; provider
      public identifiers, markup, scripts, and multiplicity behavior remain in
      the project-owned `ProjectAd.astro` edge/config boundary.
- [ ] `BaseLayout.astro` does not inject `AdSlot`, provider markup, or automatic
      `before-footer` inventory. Page type, Runtime Page Inventory, and media
      schemas do not control ads.
- [ ] Every enabled placement has a non-empty, unique provider instance identity
      and browser-visible public slot identity; malformed enabled definitions
      and invalid dimensions fail closed.
- [ ] Known positive width/height pairs reserve responsive aspect-ratio space;
      unknown dimensions do not create a universal minimum height or blank block.
- [ ] Generated HTML contains at most one occurrence of each semantic placement,
      provider instance identity, and bootstrap identity per page, with exactly
      one provider instance for each rendered semantic wrapper.
- [ ] Every external provider bootstrap resource has one normalized script
      identity per page, including when an accidental duplicate omits the
      cooperative marker; inline bootstrap uses a stable `data-ad-bootstrap`
      identity.
- [ ] Client output/config contains no private API key, account token, admin
      credential, signing secret, or internal workflow/review wording.
- [ ] Automated tests never contact a provider and do not treat inventory,
      provider HTTP success, creative insertion, or viewability as a CI contract.

### Generated output, SEO, and budgets

`npm run build` must complete each stage:

- [ ] configuration/content/fact/media validation;
- [ ] Astro static generation;
- [ ] exact Runtime Page Inventory ↔ HTML output reconciliation;
- [ ] Pagefind indexing;
- [ ] Pagefind 1.5.2 exact artifact classification and normalization;
- [ ] generated HTML, internal-link, canonical, robots, JSON-LD, sitemap, image
      alt, media, and orphan-page audit;
- [ ] per-page HTML ≤ 80 KB;
- [ ] referenced CSS ≤ 64 KB;
- [ ] referenced JavaScript ≤ 230 KB;
- [ ] normalized contract-required Pagefind payload ≤ 800,000 B; raw Pagefind
      total is diagnostic only;
- [ ] exact known optional stock UI is absent or proven unreferenced before
      removal; unknown structure and missing required artifacts fail closed.

Also inspect the final output directly:

- [ ] Canonical URLs use the configured production HTTPS origin.
- [ ] Indexable pages use `index, follow, max-image-preview:large` and one
      `data-pagefind-body` region.
- [ ] Noindex pages are absent from sitemap and Pagefind body.
- [ ] `robots.txt` references the configured sitemap index.
- [ ] Sitemap URLs equal enabled indexable Inventory routes.
- [ ] Every page has one H1, non-empty title/description, valid JSON-LD, and no
      broken internal link.
- [ ] Ordinary static pages do not hydrate client JavaScript; islands appear
      only on Search/entity-filter/calculator/planner pages that use them.

### Fresh Human-review evidence output

Use `npm run build:evidence` only when final validation is blocked solely by a
contract-valid Human/visual `PENDING` readiness state and fresh rendered output
is required for review. It must fail for `REVISE`, `BLOCK`, malformed or
unsupported lifecycle data, Inventory ambiguity, missing content/assets,
fallback-only invalid states, unknown Pagefind structures, and every non-media
deterministic error.

- [ ] Opening/closing output clearly says `FRESH VISUAL EVIDENCE BUILD`,
      `NOT FINAL CLOSING BUILD`, and `HUMAN REVIEW REQUIRED`.
- [ ] Successful evidence output contains
      `dist/EVIDENCE_BUILD_NOT_FINAL.json` with only `mode: evidence` and
      `final: false` semantics.
- [ ] Evidence generation does not mutate Human decisions, visual state,
      waivers, rights state, or `MEDIA_DECISION_TABLE.md`.
- [ ] After explicit Human decisions, rerun the fresh canonical sequence.
- [ ] Successful `npm run build` output does not contain the evidence marker;
      a surviving marker fails closed.

## Feature-off and fallback matrix

Use unit fixtures or isolated repository copies. Do not edit production
Inventory merely to manufacture a state.

| State | Deterministic expectation | Evidence to record |
| --- | --- | --- |
| Guides OFF | No guide Hub/article static paths; unrelated Search may remain if enabled | Optional-route test or isolated build routes |
| Search OFF | No `/search/` output, nav reference, sitemap entry, or Pagefind body | Optional-route test or isolated build routes |
| Entity modules OFF | No entity Hub/database/detail output or required fact file read | Catalog/fact-loader tests and build tree |
| News OFF | No patch route or Latest Updates section | Page-model/homepage tests and output |
| Tools OFF | No calculator/planner route or island reference | Page-model test and output assets/HTML |
| Empty Media | Valid build; no media wrapper/placeholder | Default manifest build |
| No FAQ | Valid article; no FAQ heading/wrapper | Component/build/browser inspection |
| No applicable Quick Facts | No QuickFacts heading/wrapper | Homepage/article inspection |
| Minimal homepage | Hero remains coherent; optional sections absent | Pure model + browser fixture |
| 20+ page homepage | Deterministic de-duplication; all eligible pages discoverable | Model + browser fixture |
| Media-rich page/home | Fixed placements render responsively | Isolated manifest build + browser fixture |
| Local MP4/WebM video | Native video renders controls, playsinline, metadata preload and source link | Media rendering test + build audit |
| Hub hero media | Hub renders only configured hero and no gallery/trailer wrappers | Component/build inspection |

## Starter adoption smoke test

- [ ] Root `npm run check` passes every existing test file without skips.
- [ ] `npm run verify:unadopted-final` proves validate and final build reject the
      shipped example specifically with PP-02, in a disposable full copy.
- [ ] `npm run verify:adopted-final` runs real validate/check/build on the neutral
      Field Notes full copy; all return zero, with no final evidence marker or
      unapproved privacy/terms routes. The copy is cleaned up.
- [ ] CI uses the same gates; package-lock and production Core stay unchanged.
- [ ] These synthetic results do not replace real-project/human adoption QA.
      AX-01 actual browser evidence remains pending WS-06A.

Use a disposable isolated copy, never the canonical working tree:

- [ ] Copy the Starter at the candidate baseline commit.
- [ ] Install exactly the committed dependencies with `npm ci`.
- [ ] Replace basic brand/site/SEO values.
- [ ] Author grouped navigation using Page IDs.
- [ ] Keep or edit Inventory and add one reviewed guide row/contentRef.
- [ ] Add one matching MDX guide.
- [ ] Optionally add one local file under `public/media/` and its manifest
      mapping/provenance.
- [ ] Run `npm run validate`, `npm run check`, and `npm run build`.
- [ ] Confirm exact output reconciliation and expected route count.
- [ ] Confirm the disposable content/media never enters the canonical Starter.

## HUMAN / QUALITATIVE release gate

Automation cannot approve the following items.

### Content, facts, and game fit

- [ ] Each page solves a real player task and is useful beyond a rewritten
      search snippet.
- [ ] Titles, descriptions, headings, FAQ, and internal links match visible
      content and actual player intent.
- [ ] Factual claims, game versions, patch labels, formulas, and observations
      have been manually checked against the cited source.
- [ ] Sources are authoritative enough for the claim and their access dates are
      current.
- [ ] Competitive coverage, content-family selection, P0/P1/P2 scope, and game
      fit satisfy `GAME_SOP v2.6.5` and project research.
- [ ] Internal review/update flags are cleared only by an authorized human.

### Media and rights

- [ ] Every image/video is useful at its placement and represents the correct
      game/version/UI.
- [ ] Cropping, compression, caption, alt text, and visual quality are acceptable
      on real devices.
- [ ] The operator has reviewed copyright, license, platform terms, attribution,
      trademark, privacy, and commercial-use requirements.
- [ ] `sourceUrl` provenance is not mistaken for legal permission.
- [ ] YouTube privacy/consent and regional availability are acceptable for the
      target audience.
- [ ] Local videos meet the project's own performance budget and observed
      delivery behavior; Starter advisory text is not treated as a release rule.

### Responsive, keyboard, and accessibility review

Inspect at minimum `390 × 844`, `768 × 1024`, and `1440 × 1000`:

- Homepage, Guide, Guide Hub, Search;
- media-rich and no-media pages;
- FAQ-rich and no-FAQ pages;
- Entity, Update, and Tool fixtures if those families are disabled by default.

At every size verify:

- [ ] navigation hierarchy, parent Hub links, dropdown/expand controls, active
      state, focus order, Escape/Enter/Space behavior, and 44–48 px touch targets;
- [ ] one clear H1, readable hierarchy, prose width, cards, TOC, tables, and no
      page-level horizontal overflow;
- [ ] Hero/gallery/captions scale naturally and video remains 16:9;
- [ ] FAQ questions and expanded answers remain readable; component headings do
      not appear in the article TOC;
- [ ] page-family accents are restrained, consistent, and do not reduce text
      contrast;
- [ ] browser console has no unexpected warning/error;
- [ ] no unexpected third-party request occurs beyond an intentionally embedded
      YouTube video;
- [ ] reduced-motion mode keeps content visible and usable.

When monetization is enabled, include a Human Ads Review in the existing Human
Visual/Release gate:

- [ ] placement is sensible and does not obstruct navigation, controls, core
      content, or Footer;
- [ ] desktop/mobile layout has no overflow or unexplained blank/dark region;
- [ ] known-dimension reservation is proportionate and stable;
- [ ] equivalent locale pages normally preserve semantic placement intent;
- [ ] ad count and slot/key/container/bootstrap reuse match the verified
      provider/project contract;
- [ ] ordinary-browser delivery is checked when the release claim depends on it,
      while requested, rendered, and viewable remain separate evidence claims.

Provider delivery uncertainty is recorded as `PROVIDER/ENVIRONMENT CHECK
REQUIRED` or `HUMAN_BROWSER_CHECK_REQUIRED`; an automated block or HTTP error
alone is not production-delivery proof and must not become a universal CI gate.

Before commercial release, repeat representative checks in current Safari,
Chrome, and Firefox, on real touch hardware and with a screen reader where
practical.

### Live delivery and legal

- [ ] Replace `gameatlas.example`, Starter legal copy, and placeholder brand
      values before deployment.
- [ ] Validate representative live URLs with Schema.org Validator and Google
      Rich Results Test.
- [ ] Verify HTTPS, redirects, custom 404, cache/compression headers, robots,
      sitemap, and Pagefind from outside authenticated development systems.
- [ ] Run Lighthouse/Core Web Vitals on the real deployed corpus and target
      devices.
- [ ] Review analytics, cookies, advertising, privacy, terms, and jurisdictional
      requirements for the actual deployment.
- [ ] Obtain explicit authorization before upload, production alias, domain, or
      DNS changes.

## Expected non-blocking warnings

Astro reports no files matching `src/content/meta/**/*.{md,mdx}` and
`src/content/news/**/*.{md,mdx}` while those optional features are disabled and
the collections intentionally contain no articles. This is expected only in
that state. Do not add fake content to silence the message.

## Release evidence record

Record, at minimum:

- baseline commit, SOP commit, branch, Node/npm versions;
- files changed and architecture-drift audit;
- test file/test counts and command exit status;
- enabled pages, generated routes, sitemap/Pagefind counts, size budgets;
- feature-off/fallback/adoption smoke results;
- responsive viewport/page matrix and console state;
- known warnings, non-blocking limitations, and unresolved human checks;
- dependency/lockfile diff;
- final verdict: `READY FOR HUMAN RELEASE REVIEW` or
  `NOT READY — BLOCKERS FOUND`.

The automated agent does not declare the Starter released. A human owns the
final release decision.

## WS-06A Core browser evidence

- [ ] Actual package.json provides check:browser; exact dev-only playwright 1.63.0 and all three real engines are installed.
- [ ] Run npm run check, verify:unadopted-final and verify:adopted-final before check:browser; all existing suites remain active.
- [ ] Raw qualification: all47 cases execute (27 baseline/3 no-JS/12 boundary/4 reduced-motion/1 resize),0 skip/NOT_RUN; strict raw PASS additionally requires0 FAIL. For finite workstream closure follow the separate policy below.
- [ ] Real engine version/revision, current uncommitted source, fixture source and final build bind every row to one build. Record canonical Contract identity using the actual supported input mode.
- [ ] Verify true HTTP404 recovery, document overflow <=1 CSS px, keyboard-accessible local .table-scroll, original heading/main/skip/footer paths, <=900 navigation and <=620 actual header/meta/404 changes.
- [ ] Verify Tab/Shift+Tab/Enter/Space/Escape, native no-JS nested anchors, ancestor cleanup and live 899→901→899 child-focus migration. Check reduced-motion scroll/animations and 44x44 mobile target intent.
- [ ] Cleanup must stop preview/browsers and remove the disposable fixture; preserve failed-run evidence in a distinct directory.
- [ ] Machine focus outlines and target geometry do not replace human visual focus/contrast approval. AX-02 human, AX-03 assembled, PA-01, REF/real-project and V2.7 release outcomes remain unclaimed.

Full method: CORE_BROWSER_EVIDENCE.md. Unsupported raw-table authoring is outside this test scope; never add test CSS or bypass safety to produce PASS.

Contract evidence mode: default FILE_SHA256 requires the real accepted SOP Contract file and exact observed hash; missing/mismatched file fails without automatic fallback. Standalone Core CI explicitly uses PINNED_REFERENCE with null filePath/observedSha256 and does not verify SOP bytes or triad compatibility. A cross-artifact/independent V2.7 acceptance gate requires FILE_SHA256; reference-only evidence is insufficient and must HARD STOP there.

## WS-06A WebKit verification policy V1 — separate closure evidence

The canonical Contract and its capability requirements remain unchanged. `check:browser` and `validateBrowserEvidence` retain the strict raw 47/47 PASS gate. Every one of the 47 matrix cases must execute, with no skip/NOT_RUN/missing assertion. Preserve each original FAIL and every historical evidence file. A policy disposition never changes a raw row to PASS, N/A, SKIP or an exception.

The selected Starter must actually supply `verify:browser-closure`; inspect package.json rather than infer availability. This separate command can find the finite Core workstream **eligible for independent closure review** through either strict raw 47/47 PASS, or complete raw execution with only the exact accepted WebKit26.6/rev2359/darwin-arm64 input-profile failures plus complete independent Safari keyboard evidence. It is not automatic WS-06A acceptance. Chromium/Firefox failures, unknown infrastructure/failure details, missing or invalid evidence and stale source/build/engine identity fail closed. CI and the raw browser command remain strict and unchanged.

Plain-Tab dependent failures must match the accepted prerequisite failure detail and a bound native link-traversal probe, classified `ENVIRONMENT_PROFILE_BLOCKED`. A failed local table scroll must still prove focused wrapper, genuine overflow, no document overflow, received ArrowRight and unchanged native scroll; the pinned accepted 10-process control supports only `PRODUCT_EVIDENCE_UNRESOLVED`. Neither disposition is a product PASS. Pin policy ID `WS06A_WEBKIT_VERIFICATION_V1`, accepted proposal SHA256 `2696a9d7ee691fad07ea7b557a4acab706bb408ea0c5583c3bfe7bd5fb85d917`, and ArrowRight control SHA256 `1ff999e08c3c93d93baaca8260bee8c243c3e2367552e58ae9550473bc741344`.

Supplemental proof must cover exactly every failed case/assertion, with matching route/viewport/JS, Starter/source and independently captured manual fixture/final-dist identity. Record Safari/WebKit version, host, operator/date, real keys, observable focus/results and evidence artifacts. Accept only `HUMAN_PHYSICAL_KEYBOARD` or specifically authorized trusted system keyboard, never Playwright, injected events, programmatic focus/scroll, Option/Alt workarounds or changed Safari/macOS keyboard preferences. ArrowRight must genuinely move the table. The no-JS case must genuinely disable JavaScript; JS-enabled proof cannot substitute. A manifest declaration or synthesized positive unit fixture is not proof of real execution; an independent reviewer must inspect actual records/artifacts.

Human visual focus quality/contrast remains DEFERRED until separately reviewed. Core closure never completes AX-01/02/03 capability outcomes, assembled AX-03/PA-01, WS-06B, REF suites, WS-07 real adoption or release. Registry/outcome values are unchanged. Missing real Safari proof keeps WS-06A BLOCKED even when the policy implementation itself passes engineering tests.


## V2.7 WS03D search boundary

This bounded search slice keeps `features.search` as the sole technical activation flag. The Core `SearchProvider` interface returns public `SearchResult[]`; completed outcomes distinguish results, empty and error. Pagefind remains the current implementation behind `pagefind-search-adapter.ts`, including its existing first20-hit and safe local result normalization. The UI owns form/history, request identity, loading and rendering; idle does not require provider loading and says “Local site search,” never claiming an unavailable index is online. Older requests cannot overwrite newer submissions.

Pagefind1.5.2, the800000-byte normalized payload budget, required artifact contract and optional UI deletion policy remain fixed. Optional UI reference safety inspects both finite runtime source files: SearchIsland and the Pagefind adapter. References in either file block normalization. No alternate provider, remote service, ranking feature, analytics or query logging is introduced.

Each adopting project must record its search decision outside Core config:

- Decision: ENABLED or DISABLED.
- Rationale and corpus/task basis, with a named decision owner and evidence reference.
- The technical `features.search` value must agree with that decision. No duplicate activation boolean and no invented corpus-size claims.
- Enabled search requires actual result/empty/error browser evidence and useful local results; a working provider alone does not prove that search should be enabled.
- Disabled search requires no search route/UI and no navigation targeting the excluded page. Pagefind build artifacts need not disappear in this slice.

Mechanism/state evidence does not establish ranking quality, real-player demand, corpus usefulness or project decision appropriateness. Actual project binding belongs to Adaptation/Acceptance. Freshness/date/patch/verified/Popular/Live semantics are a separate slice.


## V2.7 WS03D freshness truth

The bounded freshness slice keeps four facts distinct:

- `publishedAt`: first page publication date.
- `updatedAt`: editorial/content update date; when publication exists it must not be earlier. Invalid ordering is rejected, never swapped or auto-corrected.
- Fact/tool `patch` or version context: recorded game/content version, independent of dates.
- Provenance `accessedAt`: when a source was checked/accessed, displayed as “Sources checked”; it does not establish an independent verification event.

`liveStatus / observed-live / not-live` are **DEFERRED**, outside Active V2.7 Core. Do not author `liveStatus` in Page Inventory or move live-state fields into another schema. The strict inventory schema rejects the retired field; no compatibility adapter or replacement live model is provided. Never infer live state from publication status, update date or patch. Do not add verifiedAt or invent real-time telemetry. General provenance evidenceNote privacy rules remain unchanged.

The pure freshness projection exposes publishedAt, updatedAt, sourceCheckedAt and optional versionContext. Source accessedAt projects to sourceCheckedAt, never verifiedAt. Wiki and editorial metadata preserve Published and Last updated separately; source access no longer claims “Last verified”. Static entity facts say “Recorded version”/recorded patch, not an unsupported current-game claim. Existing tool patch/formula wording remains bounded and unchanged. SEO datePublished/dateModified continue to use the original page publication/update authority, never source access.

Latest updates is ordered deterministically by recorded page update date and the existing priority tie-break, with that basis shown adjacent to the title. Future Popular/Trending/Latest/Live labels must state explicit editorial or data provenance. Static labels may not imply telemetry they lack. Page Inventory provides no live-state model. Synthetic freshness rendering proves only the mechanism, never actual game currency or a real project's FR-01/FR-02 outcome.

Actual project observation/evidence appropriateness remains Adaptation/Acceptance work.
