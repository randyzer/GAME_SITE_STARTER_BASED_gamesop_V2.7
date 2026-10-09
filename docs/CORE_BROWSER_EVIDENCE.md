# Core browser evidence (WS-06A)

This runner verifies the actual adopted Core in a disposable Field Notes copy. It is synthetic engineering evidence, not a real game's acceptance, an assembled site's acceptance, or visual/contrast approval. The disposable fixture does not change canonical source or inventory. Iteration12 separately authorizes only Core prose grid shrink-safety and exact current-URL reload suppression, plus their regressions. One final build is shared by all cases; PP-02, legal activation and identity validation remain active.

Use pinned Node 22.22.0 and the exact dev-only `playwright@1.63.0` dependency:

```sh
npm ci
npm exec -- playwright install chromium firefox webkit
npm run check:browser
```

The default canonical Contract path is the sibling `GAME_SOP_V2.7/docs/COMMERCIAL_GAME_SITE_PRODUCT_CONTRACT_V2.7.md`. In another checkout, explicitly set `CORE_BROWSER_CONTRACT_PATH` to the corresponding SOP file; its exact accepted SHA256 must match. Default CORE_BROWSER_CONTRACT_MODE=FILE_SHA256 reads that actual file and checks its hash; missing/mismatched input fails without fallback. Standalone CI explicitly sets CORE_BROWSER_CONTRACT_MODE=PINNED_REFERENCE and reads no Contract file. PINNED_REFERENCE records null filePath/observedSha256, binds only the exact reference identity and does not prove SOP bytes or triad compatibility. Combining PINNED_REFERENCE with CORE_BROWSER_CONTRACT_PATH is an error. Audited C2C/independent V2.7 acceptance requires FILE_SHA256. `CORE_BROWSER_EVIDENCE_DIR` overrides the default ignored `.browser-evidence/` directory; use a fresh directory for each audited run so earlier failures are retained.

| Category | Required cases |
| --- | --- |
| Chromium/Firefox/WebKit × 390×844, 768×1024, 1280×800 × shell-nav, content-detail, true 404 | 27 |
| Three engines, mobile no-JS shell/native nested navigation | 3 |
| Chromium navigation 899/900/901; layout 619/620/621 × three roles | 12 |
| Chromium reduced motion, mobile/desktop × shell/detail | 4 |
| Chromium live 899→901→899 with child focus migration | 1 |

The strict raw qualification requires all 47 to execute and pass; the separately described closure policy never rewrites that result. Required rows/assertions, exact engine/revision, source/build identity, HTTP404 and cleanup are checked; missing, duplicate, unexpected, skipped, failed or NOT_RUN evidence rejects the gate. Ordinary case failures are recorded while remaining cases run. A build/server/identity failure records all unexecuted cases as NOT_RUN and exits unsuccessfully. Missing engines never reduce the matrix.

The evidence binds the actual branch/HEAD plus the uncommitted source manifest, fixture source, final dist, exact package version, installed revisions (including platform overrides), launched browser versions, host, viewport, JS/motion and individual assertions. Manifest hashing excludes generated caches, dependencies, build output, evidence output and credential files. HEAD alone cannot identify uncommitted work. Run evidence is checked against independently computed source/build identity; the validator's unit fixtures are never real browser results.

Assertions cover ≤1 CSS px document overflow, skip/main and footer keyboard paths, Tab/Shift+Tab/Enter/Space/Escape, nested cleanup, native no-JS links, same-document focus, true HTTP404 recovery, exact <=900 navigation, <=620 header/metadata/recovery changes, live resize and reduced motion. Machine checks inspect focus outlines and 44×44 mobile navigation/brand target intent. Visual focus quality, contrast, and other control target judgments remain human DEFERRED.

The stress guide keeps its original single H2 and uses Core's existing `.table-scroll` pattern, without inline overflow or test CSS. The table must exceed the local container, the container must really scroll by keyboard, and the document must stay within its viewport. Arbitrary unwrapped raw MDX tables are outside this proof. Main article layout remains single at 619/620/621; metadata and recovery layouts supply the actual breakpoint assertions.

The runner explicitly starts Astro preview with --background, binds its exact returned PID, invokes Astro preview stop in the same disposable root, and confirms that PID is gone before recording cleanup. An owned-PID signal recovery still fails the gate. Browsers/contexts and the temporary copy are cleaned in finally. A separate cleanup audit records observed PID liveness and stop exit. Cleanup errors fail the gate. Shared browser caches are not deleted. Default output is not a shipped artifact. Do not interpret 47 synthetic passes as AX-02 manual PASS, AX-03 assembled PASS, PA-01, REF suite, WS-07 or V2.7 release PASS; capability verifiedOutcome remains governed by Contract §W.

CI retains all WS-02 gates and adds engine installation plus this command. A local run proves the local command only; it does not claim a remote GitHub Actions run. Browser-discovered runtime defects require a separately scoped amendment before source changes.

A minimal native engine probe records plain Tab/Shift+Tab across anchors/buttons/inputs. Unavailable standard link traversal remains a failure; no Alt/Option substitute, browser flag, OS change or programmatic focus is allowed to turn it green. Live resize waits for actual media-query/CSS state before judging focus, and native table scrolling records active target, key arrival and scrollLeft. Any unresolved failure blocks raw qualification; finite workstream closure additionally follows the evidence policy below.

## WS-06A WebKit verification policy V1 — separate closure evidence

The canonical Contract and its capability requirements remain unchanged. `check:browser` and `validateBrowserEvidence` retain the strict raw 47/47 PASS gate. Every one of the 47 matrix cases must execute, with no skip/NOT_RUN/missing assertion. Preserve each original FAIL and every historical evidence file. A policy disposition never changes a raw row to PASS, N/A, SKIP or an exception.

The selected Starter must actually supply `verify:browser-closure`; inspect package.json rather than infer availability. This separate command can find the finite Core workstream **eligible for independent closure review** through either strict raw 47/47 PASS, or complete raw execution with only the exact accepted WebKit26.6/rev2359/darwin-arm64 input-profile failures plus complete independent Safari keyboard evidence. It is not automatic WS-06A acceptance. Chromium/Firefox failures, unknown infrastructure/failure details, missing or invalid evidence and stale source/build/engine identity fail closed. CI and the raw browser command remain strict and unchanged.

Plain-Tab dependent failures must match the accepted prerequisite failure detail and a bound native link-traversal probe, classified `ENVIRONMENT_PROFILE_BLOCKED`. A failed local table scroll must still prove focused wrapper, genuine overflow, no document overflow, received ArrowRight and unchanged native scroll; the pinned accepted 10-process control supports only `PRODUCT_EVIDENCE_UNRESOLVED`. Neither disposition is a product PASS. Pin policy ID `WS06A_WEBKIT_VERIFICATION_V1`, accepted proposal SHA256 `2696a9d7ee691fad07ea7b557a4acab706bb408ea0c5583c3bfe7bd5fb85d917`, and ArrowRight control SHA256 `1ff999e08c3c93d93baaca8260bee8c243c3e2367552e58ae9550473bc741344`.

Supplemental proof must cover exactly every failed case/assertion, with matching route/viewport/JS, Starter/source and independently captured manual fixture/final-dist identity. Record Safari/WebKit version, host, operator/date, real keys, observable focus/results and evidence artifacts. Accept only `HUMAN_PHYSICAL_KEYBOARD` or specifically authorized trusted system keyboard, never Playwright, injected events, programmatic focus/scroll, Option/Alt workarounds or changed Safari/macOS keyboard preferences. ArrowRight must genuinely move the table. The no-JS case must genuinely disable JavaScript; JS-enabled proof cannot substitute. A manifest declaration or synthesized positive unit fixture is not proof of real execution; an independent reviewer must inspect actual records/artifacts.

Human visual focus quality/contrast remains DEFERRED until separately reviewed. Core closure never completes AX-01/02/03 capability outcomes, assembled AX-03/PA-01, WS-06B, REF suites, WS-07 real adoption or release. Registry/outcome values are unchanged. Missing real Safari proof keeps WS-06A BLOCKED even when the policy implementation itself passes engineering tests.

### Closure command inputs and provenance

```sh
WS06A_BROWSER_EVIDENCE=/absolute/fresh/core-browser-evidence.json \
WS06A_EXPECTED_IDENTITY=/absolute/session/expected-identity.json \
WS06A_NATIVE_PROBE=/absolute/session/bound-native-keyboard-probe.json \
WS06A_POLICY_PROPOSAL=/absolute/accepted/WEBKIT_VERIFICATION_POLICY_PROPOSAL_V1.md \
WS06A_ARROW_CONTROL=/absolute/accepted/arrowright-repeatability.json \
WS06A_MANUAL_PROJECT_ROOT=/absolute/session/disposable-project \
WS06A_REAL_KEYBOARD_EVIDENCE=/absolute/session/real-keyboard-evidence.json \
npm run verify:browser-closure
```

`WS06A_EXPECTED_IDENTITY` is captured independently by the build/session owner before qualification; never copy the raw report's own identity as its oracle. The command independently verifies current Starter manifest/HEAD/branch and actual Contract bytes. Manual source/dist hashes are computed directly from `WS06A_MANUAL_PROJECT_ROOT`. Exact accepted proposal/control bytes are read and hash-checked. The bound native probe envelope contains schemaVersion1, rawEvidenceSha256, independently captured host/engine, and the unmodified WebKit probe `{plainTabReachesLink,sequence}` from the same qualification run. The raw digest prevents rebinding a different report. A probe or expected-identity file requires its own captured provenance; handwritten assertions do not establish a run.

Without `WS06A_REAL_KEYBOARD_EVIDENCE`, the command exits1 and prints the exact remaining case/assertion checklist. Without an independently captured identity it also fails closed. Neither command writes to raw evidence or modifies capability records. Keep all closure/session evidence outside the shipped Starter and preserve preview PID/cleanup audits. Stop the owned preview normally after real capture; a failed or signal-assisted cleanup blocks review.
