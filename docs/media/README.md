# Local media — V2.7 candidate WS03B contract

The Starter deliberately ships with an empty `src/data/media/media.json`.
No media is valid: pages keep their normal text/fact layout without placeholders.
A broken reference is invalid and fails validation, including references on unpublished pages.
The inherited Starter v2.6.5 documentation-correction patch line carries forward the released
and frozen V2.6.3 Phase C D1-D3 media-readiness projection here as deterministic
validation support for the `GAME_SOP v2.6.5` media lifecycle contract. The historical
`GAME_SOP v2.6.2` lifecycle and V2.6.2 Phase 1C behavior are baseline provenance
only.

## Add an asset

1. Obtain human approval for the asset's accuracy, suitability, and usage rights.
2. Store the reviewed image below `public/media/` and use `/media/...` as its `src`.
3. Add it once to the manifest's `assets`, then reference its ID from `pages`.
4. Run `npm run validate`, `npm run check`, and `npm run build`.

The only placements are `hero` (image ID), `gallery` (image IDs), and `trailer`
(video ID). WikiArticle and EntityDetail consume these mappings by their existing
Inventory `pageId`. Guide and entity/database hubs consume hero media only.
`StaticWikiPage.astro` is available for explicit static wiki page inputs and
fixed placements, but it does not create routes. A mapping cannot create or
publish a route, enable a feature, or change visibility/indexability.

```json
{
  "assets": [
    {
      "id": "overview",
      "type": "image",
      "src": "/media/overview.webp",
      "alt": "Describe what this image helps the player understand",
      "caption": "Optional visible context",
      "sourceUrl": "https://example.com/replace-with-original-source",
      "dimensions": { "width": 1200, "height": 675 },
      "rightsRef": "RESEARCH_SOURCES.md#overview-rights",
      "credit": { "text": "Reviewed project author" }
    }
  ],
  "defaultShare": "overview",
  "pages": [{ "pageId": "guide.getting-started", "hero": "overview" }]
}
```

This is a syntax example, not a supplied asset or approved source. Replace the
file, description, and source URL with reviewed project material.

## Image contract

- Images must be local files under `public/media/`; remote image URLs, traversal,
  encoded paths, query strings, fragments, and missing files are rejected.
- Use a supported image extension: `.png`, `.jpg`, `.jpeg`, `.webp`, `.avif`, `.gif`, `.svg`.
- `alt` is required. Informative images need descriptive text, not a filename or
  a generic label such as "image" or "screenshot". Precisely `alt: ""` marks a
  deliberately decorative image; human review must justify that choice.
- `sourceUrl` is required HTTPS provenance: the original source of the local file.
  A valid URL is **not proof of legal usage rights**. Rights records/approval remain
  in project SOP/research artifacts and human review.
- Hero images load eagerly; gallery/inline images load lazily. Images scale in
  their natural aspect ratio using explicit intrinsic dimensions, without crop variants.
- Optimize file size manually before adoption. The released V2.6.3 baseline
  still does not process, upload, or transcode media; this limitation
  is inherited from Starter v2.6.2.

## YouTube contract

Video `src` is an 11-character YouTube ID, not a URL. `alt` supplies the non-empty
iframe title; `caption` is optional and `sourceUrl` records the source/watch URL.
The component uses only `https://www.youtube-nocookie.com/embed/<id>`, lazy loading,
a responsive frame derived from the authored dimensions, limited permissions and fullscreen support. A visible
source link and the authored accessible equivalent remain visible when the player is blocked or unavailable.

There is no autoplay, SDK, upload support, arbitrary iframe URL, or build-time
network/availability probe. YouTube remains a runtime third-party dependency;
project owners must review privacy, consent, rights, and availability requirements.

## Local video contract

Local video `src` may use `.mp4` or `.webm` under `public/media/`, referenced as
`/media/...`. The optional `poster` must be a supported local image path under
the same safe `/media/...` boundary.

```json
{
  "id": "gameplay-trailer",
  "type": "video",
  "src": "/media/gameplay-trailer.mp4",
  "poster": "/media/gameplay-trailer-poster.webp",
  "alt": "Gameplay trailer showing the first route and boss arena",
  "caption": "Optional visible context",
  "sourceUrl": "https://example.com/replace-with-original-source",
  "dimensions": { "width": 1280, "height": 720 },
  "rightsRef": "RESEARCH_SOURCES.md#gameplay-trailer-rights",
  "accessibleEquivalent": { "kind": "text", "text": "Describe the route and arena information conveyed by this clip." }
}
```

Native video renders in the wrapper ratio derived from its explicit dimensions with controls, `playsinline`,
and `preload="metadata"`. It does not autoplay and the Starter does not
transcode, upload, create CDN variants, or define a universal byte limit.

The build audit may print a non-blocking advisory for unusually large local
video files. Treat it as an implementation-local heuristic only; project media
budgets and observed delivery behavior remain authoritative.

## Inline content and QA

MDX may import `GameMedia` and pass `mediaCatalog.getAsset("overview")` for inline
media. Keep page-level placement in the manifest, not Page Inventory/frontmatter.
Captions render as text, never injected HTML. No media title is added to the
WikiArticle TOC; the TOC still consumes only the body renderer's H2/H3 headings.

`tests/fixtures/media/` contains clearly synthetic QA illustrations and a test
manifest. These are not default game content and must not be shipped as game
screenshots. The generic production manifest remains empty after QA.

Automated checks verify deterministic structure, references and accessible
markup. They do not judge visual quality, factual appropriateness or copyright.

## V2.7 WS03B metadata and migration

Every populated image/video record requires `dimensions: { width, height }` with
positive integer values measured from that asset, and a trimmed non-empty
`rightsRef` pointing to the project's rights evidence. Nested objects are strict:
partial dimensions, an authored ratio, workflow fields and unknown metadata fail
validation. `rightsRef` is private evidence, **not approval**, and is never part of
the public presentation or rendered HTML. `sourceUrl` remains provenance only.
Optional `credit: { text, url? }` is visible attribution; its URL must use HTTPS.
A credit is not a substitute for a rights decision.

Every video additionally requires an `accessibleEquivalent`, either
`{ "kind": "text", "text": "Information conveyed by the video" }` or
`{ "kind": "link", "label": "Transcript", "href": "/guides/transcript/" }`.
The link may instead use HTTPS; local paths must be root-relative, with no
traversal, encoded segments, query, fragment or protocol-relative URL. The title
or alt is not automatically reused as an equivalent. Provide useful authored
information and verify that it remains available with a blocked third-party player.

Existing populated V2.6.5 records must be explicitly migrated by reviewing their
actual dimensions, evidence pointer and video equivalent. There are no schema
metadata defaults, automatic 1920×1080 values, automatic approval, or title-derived
transcripts. The default empty manifest and pages without media remain valid;
invalid local assets/posters still fail validation rather than acquiring a runtime
placeholder. The pure `resolveMediaPresentation` adapter and
`mediaCatalog.getPresentation(id)` expose only dimensions/derived ratio, public
credit, provenance and video equivalent. They do not select assets or decide rights.

These examples describe syntax, not verified game media. Synthetic fixtures stay
in disposable QA projects. WS03C OG/share, provider abstractions, rights engines,
processing and new placement types remain outside this slice.

## V2.7 candidate WS03C — share media authority

Sharing references the existing media manifest and ImageAsset schema:
`defaultShare` is an optional top-level image ID; `pages[].share` is an optional
page-specific image ID. Both must reference an existing informative local image;
unknown IDs, video assets and decorative images are rejected. The fixed visual
placements remain hero/gallery/trailer; share is metadata and creates no body
figure or `data-media-placement="share"` wrapper.

The catalog resolves `page.share → informative page.hero → defaultShare → none`.
It never guesses from galleries, filenames, routes or another image registry.
Page Inventory continues to own page/publication/indexability; no new image field
is added to Inventory or Game Config. `resolveShareMetadata` formats the selected
asset as absolute HTTPS URL, width, height and alt only. Private rights references,
source/credit and approval/workflow metadata are excluded from this public payload.

BaseLayout emits one OG image URL, dimensions and alt plus the matching Twitter
image/alt and summary_large_image card when resolved. No image metadata or fake
placeholder is emitted when nothing resolves. The generic empty manifest remains
structurally valid, but a **final build of an enabled indexable page requires a
resolved share image**. Missing share media alone does not fail noindex pages.
The generated audit checks exact values/cardinality and the local output asset;
missing/conflicting URL/dimensions/alt, duplicate tags or private evidence leaks
fail the final audit. Evidence-purpose structural output still does not grant
production acceptance.

For adoption, author and review a suitable local image with measured dimensions,
descriptive alt, source and private rights evidence, then set a project default
and/or explicit page share references. Rights and visual suitability remain human
SOP decisions; valid metadata never supplies approval. Only disposable adopted QA
fixtures receive synthetic default share media. Production media.json remains
empty until project material is explicitly authored. No image service, separate
SEO image registry, processing/provider abstraction, search or freshness feature
is added by this slice.

This bounded WS03C slice does not establish SEO-02/MC-* capability PASS,
close formal WS03/WS06A, or permit release. Genuine Safari keyboard proof remains
absent; release hold active and capability promotion NONE.
