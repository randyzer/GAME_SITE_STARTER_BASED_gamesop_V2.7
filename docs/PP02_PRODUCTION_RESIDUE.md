# PP-02 production residue safety — candidate catalog revision 1

This is an additive Phase A candidate on the frozen v2.6.5 baseline, not a
release declaration. The shipped example is deliberately unadopted and cannot
pass final validation or build. A passing synthetic test fixture is not approval
of a real game, business identity, content facts, media rights or legal policy.

## Adopt the example

1. Replace branding, site URL, SEO and social fields in `game.config.ts`.
2. Adapt enabled page titles, descriptions and public sources in Page Inventory.
3. Replace the public setup guide and About copy with reviewed project content.
4. Replace the accessible name and content of the shipped logo. Remove unused
   public assets when changing its path; copied text must have a known registration.
5. Keep legal pages unavailable until their project payload is explicitly approved
   by the existing TL-01 digest contract. TL-02 identity confirmation still applies.
6. Run `npm run validate`, `npm run check`, then `npm run build`.

The fixed tooling catalog retains reserved example host, authoritative branding
and complete supplied instruction/legal signatures after projects edit their
source. It never bans general words such as Add, Replace, TODO or Atlas in
ordinary game prose. Branding fields are separate from quoted article text.
Whitespace is collapsed; hostname and branding matching are case-insensitive.
Inline tag boundaries preserve adjacent characters; block boundaries supply
word separation. HTTP(S) and protocol-relative URL hostnames are parsed before
plain-text host tokens, so encoded dots are recognized without treating paths,
credentials or unrelated longer hostnames as the reserved host. Ordinary media
text is not a site-branding field; logo/favicon branding is checked separately.
Known full instruction signatures remain case-sensitive. Both source and
rendered forms of the shipped code-formatted brand instruction are registered.

Optional `residueSentinels` entries contain only `id`, a non-empty `literal`, and
`surface: branding | url | public-text`. IDs must be unique and cannot use `core.`.
They add checks; no regex, executable code, allowlist or disable switch is accepted.

## Required coverage

Source preflight checks active branding/config copy, enabled inventory metadata,
public source projections, resolved narrative bodies, About/legal payloads and
registered copied text. Private provenance evidence notes, documentation, tests
and content not selected by the enabled catalog are excluded. The source reader
keeps body text while reading the existing content reference; it does not add an
MDX/YAML parser. FAQ and dynamic fact/tool rendering are covered by their emitted
HTML/JSON-LD and search output, rather than reparsing source frontmatter or code.

Generated output checks every enabled HTML route, including 404, noindex and
unlisted emitted pages. It checks decoded visible text and accessible names,
known branding projections, URL attributes, title/share/meta values, JSON-LD
strings, robots, sitemap index and sitemap URLs. Existing route reconciliation,
SEO, legal, identity, media and asset-budget audits continue independently.

Copied textual assets are enumerated only under `public/`. The closed registry
contains favicon, the configured logo and local media manifest text/SVG files.
Missing, invalid UTF-8 or unregistered copied text blocks validation/audit. The
media integration README lives in `docs/media/README.md`, outside public output;
its historical instruction signature remains registered for regression checks.
Ordinary dependency bundles, binary media, search binary indexes and WASM are not
scanned as text.

Pagefind's existing exact 1.5.2 manifest/metadata contract enumerates required
files. The readable adapter checks declared metadata text, filter options and
fragment URL/content/title/description/filter/anchor text. Its gzip signature,
CBOR structures and fragment fields were verified using local real 1.5.2 output.
Unknown format/version, corrupt bytes, missing declared files or incomplete
route/document/asset/search coverage fails closed. Upgrading Pagefind requires
review of this adapter as well as the existing artifact contract.

## Evidence mode

The build orchestrator explicitly passes `--purpose final|evidence` to the same
last audit stage. Standalone audit defaults to final. Evidence mode downgrades
only known ordinary brand/domain residue to warnings; instruction/legal residue,
unsupported identity and coverage failures remain errors. Existing evidence
marker rules remain in force: marked output cannot pass standalone final audit.

The checker identifies only fixed known signatures and configured literals.
Partial rewrites, misleading numbers, false popularity claims, unknown contacts,
game inaccuracies and visual quality still need project acceptance.
