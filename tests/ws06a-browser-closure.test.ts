import { describe, expect, it } from "vitest";
import { coreBrowserMatrix } from "../scripts/core-browser-matrix";
import { canonicalContractReference, validateBrowserEvidence, validateBrowserEvidenceSnapshot, type CoreBrowserEvidence, type EvidenceIdentity } from "../scripts/core-browser-evidence";
import { verifyBrowserClosure, webkitPolicy, type ManualBuildIdentity } from "../scripts/verify-ws06a-browser-closure";

// These are rejection fixtures, never records of Safari or real browser execution.
function fixture() {
  const identity: EvidenceIdentity = {
    starter: { branch: "test", head: "a".repeat(40), workingTreeSha256: "b".repeat(64) },
    canonicalContract: { reference: canonicalContractReference, verification: { mode: "FILE_SHA256", filePath: "contract.md", observedSha256: canonicalContractReference.sha256 } },
    fixture: { identity: "Field Notes synthetic adoption", sourceSha256: "c".repeat(64) },
    build: { distSha256: "d".repeat(64) }, playwright: { packageVersion: "1.63.0" },
    host: { platform: "darwin", arch: "arm64", node: "v22.22.0" },
    engines: { chromium: { browserName: "chromium", version: "153.0.8010.12", revision: "1243" }, firefox: { browserName: "firefox", version: "155.0", revision: "1543" }, webkit: { browserName: "webkit", version: "26.6", revision: "2359" } },
  };
  const raw: CoreBrowserEvidence = {
    schemaVersion: "1", identity: structuredClone(identity), overall: "PASS", infrastructureErrors: [],
    cleanup: { previewStopped: true, fixtureRemoved: true }, humanReview: { visualFocus: "DEFERRED", contrast: "DEFERRED" },
    rows: coreBrowserMatrix.map(({ requiredAssertions, ...row }) => ({ ...structuredClone(row), browserVersion: identity.engines[row.engine].version,
      browserRevision: identity.engines[row.engine].revision, sourceSha256: identity.fixture.sourceSha256,
      buildSha256: identity.build.distSha256, httpStatus: row.role === "recovery-404" ? 404 : 200,
      assertions: requiredAssertions.map(name => ({ name, passed: true, detail: "synthetic rejection fixture" })),
      caseStatus: "PASS", durationMs: 1, failure: null })),
  };
  const row = raw.rows.find(r => r.engine === "webkit" && r.role === "shell-nav")!;
  const failed = row.assertions.find(a => a.name === "skip-keyboard")!;
  failed.passed = false; failed.detail = "First Tab does not focus skip link";
  row.caseStatus = "FAIL"; row.failure = failed.detail; raw.overall = "FAIL";
  raw.infrastructureErrors = ["WEBKIT_STANDARD_TAB_LINK_PROFILE_UNAVAILABLE"];
  const manualBuild: ManualBuildIdentity = { fixtureIdentity: "Field Notes synthetic adoption", fixtureSourceSha256: identity.fixture.sourceSha256, distSha256: "f".repeat(64) };
  const rawEvidenceSha256 = "1".repeat(64);
  const probe = { schemaVersion: "1", rawEvidenceSha256, host: identity.host, engine: identity.engines.webkit,
    webkit: { plainTabReachesLink: false, sequence: [{ key: "Tab", tag: "BUTTON", text: "button" }, { key: "Tab", tag: "INPUT", text: "" }] } };
  const alternate = { schemaVersion: "1", policy: webkitPolicy, rawEvidenceSha256,
    starter: identity.starter, manualBuild, browser: { product: "Safari", version: "26.6", engineFamily: "WebKit" },
    host: identity.host, input: { method: "HUMAN_PHYSICAL_KEYBOARD", keyboardNavigationSettingChangedForTest: false },
    review: { operator: "synthetic operator", observedAt: "2026-10-06T00:00:00Z", notes: "Unit fixture only" },
    rows: [{ caseId: row.caseId, route: row.route, viewport: row.viewport, javascript: row.javascript,
      assertions: [{ name: failed.name, result: "PASS", disposition: "ENVIRONMENT_PROFILE_BLOCKED",
        observation: { keys: ["Tab", "Enter"], before: "body", after: "main content", focusVisible: true, artifact: "synthetic-only.png" } }] }],
  };
  return { rawEvidence: raw as unknown, expectedIdentity: identity, nativeProbe: probe as unknown,
    realKeyboardEvidence: alternate as unknown, expectedManualBuild: manualBuild, rawEvidenceSha256 };
}

describe("WS06A closure evidence, independent from strict raw qualification", () => {
  it("allows complete policy evidence for review without rewriting any raw failure", () => {
    const input = fixture(); const before = JSON.stringify(input.rawEvidence);
    expect(verifyBrowserClosure(input).errors).toEqual([]);
    expect(verifyBrowserClosure(input).decision).toBe("WS06A_CLOSURE_ELIGIBLE_FOR_INDEPENDENT_REVIEW");
    expect(JSON.stringify(input.rawEvidence)).toBe(before);
    expect(validateBrowserEvidence(input.rawEvidence, input.expectedIdentity).length).toBeGreaterThan(0);
    expect(validateBrowserEvidenceSnapshot(input.rawEvidence, input.expectedIdentity)).toEqual([]);
  });
  it("allows strict raw 47/47 without supplemental evidence", () => {
    const input = fixture(), raw = input.rawEvidence as CoreBrowserEvidence;
    raw.overall = "PASS"; raw.infrastructureErrors = [];
    for (const row of raw.rows) { row.caseStatus = "PASS"; row.failure = null; for(const a of row.assertions) a.passed = true; }
    input.realKeyboardEvidence = undefined; input.nativeProbe = undefined;
    expect(verifyBrowserClosure(input).decision).toBe("RAW_QUALIFICATION_COMPLETE");
    expect(verifyBrowserClosure(input).errors).toEqual([]);
  });
  const defects: Record<string, (input: ReturnType<typeof fixture>) => void> = {
    missingRaw: i => { i.rawEvidence = undefined; }, malformedRaw: i => { i.rawEvidence = {}; },
    missingProbe: i => { i.nativeProbe = undefined; }, missingAlternate: i => { i.realKeyboardEvidence = undefined; },
    wrongExpectedSource: i => { i.expectedIdentity.starter.workingTreeSha256 = "0".repeat(64); },
    notRun: i => { (i.rawEvidence as any).rows[0].caseStatus = "NOT_RUN"; },
    chromiumFailure: i => { const r=(i.rawEvidence as any).rows[0];r.caseStatus="FAIL";r.failure="input failure";r.assertions[0].passed=false; },
    firefoxFailure: i => { const r=(i.rawEvidence as any).rows.find((r:any)=>r.engine==="firefox");r.caseStatus="FAIL";r.failure="input failure";r.assertions[0].passed=false; },
    unknownInfrastructure: i => { (i.rawEvidence as any).infrastructureErrors.push("SERVER_FAILURE"); },
    unknownFailureDetail: i => { const r=(i.rawEvidence as any).rows.find((r:any)=>r.caseStatus==="FAIL");r.assertions.find((a:any)=>!a.passed).detail="Core focus regression"; },
    missingAssertion: i => { (i.rawEvidence as any).rows[0].assertions.pop(); },
    duplicateRow: i => { (i.rawEvidence as any).rows.push((i.rawEvidence as any).rows[0]); },
    probeReachable: i => { (i.nativeProbe as any).webkit.plainTabReachesLink=true; },
    probeContradictsSequence: i => { (i.nativeProbe as any).webkit.sequence.push({key:"Tab",tag:"A",text:"link"}); },
    probeVersion: i => { (i.nativeProbe as any).engine={...i.expectedIdentity.engines.webkit,version:"26.7"}; },
    probeDigest: i => { (i.nativeProbe as any).rawEvidenceSha256="0".repeat(64); },
    wrongSource: i => { (i.realKeyboardEvidence as any).starter={...i.expectedIdentity.starter,workingTreeSha256:"0".repeat(64)}; },
    wrongBuild: i => { (i.realKeyboardEvidence as any).manualBuild={...i.expectedManualBuild,distSha256:"0".repeat(64)}; },
    unrelatedManualSource: i => {
      i.expectedManualBuild = { ...i.expectedManualBuild, fixtureSourceSha256: "e".repeat(64) };
      (i.realKeyboardEvidence as any).manualBuild = i.expectedManualBuild;
    },
    wrongPolicy: i => { (i.realKeyboardEvidence as any).policy={...webkitPolicy,proposalSha256:"0".repeat(64)}; },
    wrongPolicyVersion: i => { (i.realKeyboardEvidence as any).policy={...webkitPolicy,id:"UNKNOWN"}; },
    unknownDisposition: i => { (i.realKeyboardEvidence as any).rows[0].assertions[0].disposition="EXCEPTION"; },
    missingFailedRow: i => { (i.realKeyboardEvidence as any).rows=[]; },
    inventedRow: i => { (i.realKeyboardEvidence as any).rows.push({...((i.realKeyboardEvidence as any).rows[0]),caseId:"invented"}); },
    missingFailedAssertion: i => { (i.realKeyboardEvidence as any).rows[0].assertions=[]; },
    inventedAssertion: i => { (i.realKeyboardEvidence as any).rows[0].assertions.push({...((i.realKeyboardEvidence as any).rows[0].assertions[0]),name:"invented"}); },
    failedAlternate: i => { (i.realKeyboardEvidence as any).rows[0].assertions[0].result="FAIL"; },
    programmatic: i => { (i.realKeyboardEvidence as any).input.method="PROGRAMMATIC_FOCUS"; },
    playwright: i => { (i.realKeyboardEvidence as any).input.method="PLAYWRIGHT_KEYBOARD"; },
    changedPreference: i => { (i.realKeyboardEvidence as any).input.keyboardNavigationSettingChangedForTest=true; },
    wrongBrowser: i => { (i.realKeyboardEvidence as any).browser.product="Chromium"; },
    wrongRoute: i => { (i.realKeyboardEvidence as any).rows[0].route="/wrong/"; },
    wrongViewport: i => { (i.realKeyboardEvidence as any).rows[0].viewport={width:1,height:1}; },
    wrongJavascript: i => { (i.realKeyboardEvidence as any).rows[0].javascript=false; },
    missingOperator: i => { (i.realKeyboardEvidence as any).review.operator=""; },
    invalidDate: i => { (i.realKeyboardEvidence as any).review.observedAt="not a date"; },
    emptyObservation: i => { (i.realKeyboardEvidence as any).rows[0].assertions[0].observation.after=""; },
  };
  it.each(Object.entries(defects))("fails closed: %s", (_name, mutate) => {
    const input = fixture(); mutate(input);
    expect(verifyBrowserClosure(input).errors.length).toBeGreaterThan(0);
    expect(verifyBrowserClosure(input).decision).toBe("BLOCKED");
  });
  function arrowFixture() {
    const input = fixture(), raw = input.rawEvidence as CoreBrowserEvidence;
    const row = raw.rows.find(r => r.engine === "webkit" && r.role === "content-detail" && r.viewport.width === 768)!;
    const a = row.assertions.find(a => a.name === "table-local-scroll")!;
    a.passed = false;
    a.detail = "Native ArrowRight did not scroll: " + JSON.stringify({ before: { active: true, scroll: 0 }, after: { active: true, scroll: 0, key: "ArrowRight" },
      geometry: { tableWidth: 780, wrapperClient: 718, wrapperScroll: 780, overflow: "auto", documentClient: 768, documentScroll: 768 } });
    row.caseStatus = "FAIL"; row.failure = a.detail;
    (input.realKeyboardEvidence as any).rows.push({ caseId: row.caseId, route: row.route, viewport: row.viewport, javascript: true,
      assertions: [{ name: a.name, result: "PASS", disposition: "PRODUCT_EVIDENCE_UNRESOLVED", observation: {
        keys: ["Tab", "ArrowRight"], before: "table wrapper", after: "table visibly moved", focusVisible: true, artifact: "unit-fixture-only.png",
        scrollBefore: 0, scrollAfter: 40, trustedKeyReceived: true } }] });
    return input;
  }
  it("requires actual ArrowRight evidence for unresolved native scrolling", () => {
    expect(verifyBrowserClosure(arrowFixture()).errors).toEqual([]);
  });
  it.each(["missing-key", "missing-scroll", "untrusted", "programmatic-only", "bad-geometry"])("rejects ArrowRight %s", kind => {
    const input = arrowFixture(); const a = (input.realKeyboardEvidence as any).rows[1].assertions[0];
    if (kind === "missing-key") a.observation.keys = ["Tab"];
    if (kind === "missing-scroll") delete a.observation.scrollAfter;
    if (kind === "untrusted") a.observation.trustedKeyReceived = false;
    if (kind === "programmatic-only") a.observation.scrollAfter = 0;
    if (kind === "bad-geometry") {
      const row = (input.rawEvidence as CoreBrowserEvidence).rows.find(r => r.engine === "webkit" && r.role === "content-detail" && r.viewport.width === 768)!;
      row.assertions.find(a => a.name === "table-local-scroll")!.detail = "Local table overflow contract failed: {}";
    }
    expect(verifyBrowserClosure(input).errors.length).toBeGreaterThan(0);
  });
  it("never substitutes JS-enabled proof for a no-JS failed row", () => {
    const input = fixture(), raw = input.rawEvidence as CoreBrowserEvidence;
    const row = raw.rows.find(r => r.engine === "webkit" && r.category === "no-js")!;
    const a = row.assertions.find(a => a.name === "skip-keyboard")!;
    a.passed = false; a.detail = "First Tab does not focus skip link"; row.caseStatus = "FAIL"; row.failure = a.detail;
    (input.realKeyboardEvidence as any).rows.push({ caseId: row.caseId, route: row.route, viewport: row.viewport, javascript: true,
      assertions: [structuredClone((input.realKeyboardEvidence as any).rows[0].assertions[0])] });
    expect(verifyBrowserClosure(input).errors).toContain(row.caseId + ": alternate case identity mismatch");
  });
});
