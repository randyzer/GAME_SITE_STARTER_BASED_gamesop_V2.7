import { describe, expect, it, vi } from "vitest";
import { coreBrowserMatrix, validateMatrix } from "../scripts/core-browser-matrix";
import { canonicalContractReference, resolveContractBinding, validateBrowserEvidence, type CoreBrowserEvidence, type EvidenceIdentity } from "../scripts/core-browser-evidence";

// Synthetic schema fixtures exercise rejection. They are never emitted as browser evidence.
const identity: EvidenceIdentity = {
  starter: { branch: "v2.7/evolution", head: "a".repeat(40), workingTreeSha256: "b".repeat(64) },
  canonicalContract: { reference: canonicalContractReference, verification: { mode: "FILE_SHA256", filePath: "SOP/contract.md", observedSha256: canonicalContractReference.sha256 } },
  fixture: { identity: "Field Notes synthetic adoption", sourceSha256: "d".repeat(64) },
  build: { distSha256: "e".repeat(64) }, playwright: { packageVersion: "1.63.0" },
  host: { platform: "test", arch: "test", node: "v22.22.0" },
  engines: {
    chromium: { browserName: "chromium", version: "140.0.0.0", revision: "1200" },
    firefox: { browserName: "firefox", version: "140.0", revision: "1500" },
    webkit: { browserName: "webkit", version: "26.0", revision: "2200" },
  },
};
function complete(): CoreBrowserEvidence {
  return { schemaVersion: "1", identity: structuredClone(identity), overall: "PASS", infrastructureErrors: [],
    cleanup: { previewStopped: true, fixtureRemoved: true }, humanReview: { visualFocus: "DEFERRED", contrast: "DEFERRED" },
    rows: coreBrowserMatrix.map((row) => ({ ...structuredClone(row), requiredAssertions: undefined,
      browserVersion: identity.engines[row.engine].version, browserRevision: identity.engines[row.engine].revision,
      sourceSha256: identity.fixture.sourceSha256, buildSha256: identity.build.distSha256,
      httpStatus: row.role === "recovery-404" ? 404 : 200, caseStatus: "PASS" as const, durationMs: 1, failure: null,
      assertions: row.requiredAssertions.map((name) => ({ name, passed: true, detail: "synthetic validator fixture" })),
    })).map(({ requiredAssertions: _, ...row }) => row),
  };
}

describe("Core browser evidence completeness", () => {
  it("freezes 27+3+12+4+1 real execution obligations", () => {
    expect(validateMatrix()).toEqual([]);
    expect(coreBrowserMatrix).toHaveLength(47);
    expect(validateBrowserEvidence(complete(), identity)).toEqual([]);
  });
  const defects: Record<string, (report: CoreBrowserEvidence) => void> = {
    missing: (r) => { r.rows.pop(); }, duplicate: (r) => { r.rows.push(r.rows[0]); },
    unexpected: (r) => { r.rows[0].caseId = "unplanned"; },
    notRun: (r) => { r.rows[0].caseStatus = "NOT_RUN"; }, fail: (r) => { r.rows[0].caseStatus = "FAIL"; },
    missingAssertion: (r) => { r.rows[0].assertions.pop(); }, falseAssertion: (r) => { r.rows[0].assertions[0].passed = false; },
    duplicateAssertion: (r) => { r.rows[0].assertions[1] = r.rows[0].assertions[0]; },
    engine: (r) => { r.rows[0].engine = "webkit"; }, viewport: (r) => { r.rows[0].viewport.width = 1; },
    javascript: (r) => { r.rows[0].javascript = false; }, motion: (r) => { r.rows[0].reducedMotion = "reduce"; },
    emptyVersion: (r) => { r.rows[0].browserVersion = ""; }, fakeVersion: (r) => { r.rows[0].browserVersion = "verified-test-version"; },
    emptyRevision: (r) => { r.rows[0].browserRevision = ""; }, revision: (r) => { r.rows[0].browserRevision = "1"; },
    emptySource: (r) => { r.identity.starter.workingTreeSha256 = ""; }, source: (r) => { r.identity.starter.workingTreeSha256 = "f".repeat(64); },
    fixture: (r) => { r.rows[0].sourceSha256 = "f".repeat(64); },
    emptyBuild: (r) => { r.identity.build.distSha256 = ""; }, build: (r) => { r.rows[0].buildSha256 = "f".repeat(64); },
    wrong404: (r) => { r.rows.find((row) => row.role === "recovery-404")!.httpStatus = 200; },
    cleanup: (r) => { r.cleanup.fixtureRemoved = false; }, infrastructure: (r) => { r.infrastructureErrors.push("preview failed"); },
    previewCleanup: (r) => { r.cleanup.previewStopped = false; },
    failedOverall: (r) => { r.overall = "FAIL"; },
    contractHash: (r) => { Object.assign(r.identity.canonicalContract.reference, { sha256: "f".repeat(64) }); },
    contractPath: (r) => { Object.assign(r.identity.canonicalContract.reference, { canonicalPath: "wrong" }); },
    contractOwner: (r) => { Object.assign(r.identity.canonicalContract.reference, { owningArtifact: "Starter" }); },
    unknownMode: (r) => { Object.assign(r.identity.canonicalContract.verification!, { mode: "GUESS" }); },
    nullFilePath: (r) => { Object.assign(r.identity.canonicalContract.verification!, { filePath: null }); },
    nullObserved: (r) => { Object.assign(r.identity.canonicalContract.verification!, { observedSha256: null }); },
    wrongObserved: (r) => { Object.assign(r.identity.canonicalContract.verification!, { observedSha256: "f".repeat(64) }); },
    unboundContract: (r) => { r.identity.canonicalContract.verification = null; },
    pinnedWithFile: (r) => { r.identity.canonicalContract.verification = { mode: "PINNED_REFERENCE", filePath: null, observedSha256: null }; Object.assign(r.identity.canonicalContract.verification, { filePath: "claimed-file" }); },
    pinnedWithObserved: (r) => { r.identity.canonicalContract.verification = { mode: "PINNED_REFERENCE", filePath: null, observedSha256: null }; Object.assign(r.identity.canonicalContract.verification, { observedSha256: canonicalContractReference.sha256 }); },
  };
  it.each(Object.entries(defects))("rejects %s", (_name, mutate) => {
    const report = complete(); mutate(report);
    expect(validateBrowserEvidence(report, identity).length).toBeGreaterThan(0);
  });
  it("rejects malformed and silently skipped evidence", () => {
    expect(validateBrowserEvidence(null, identity).length).toBeGreaterThan(0);
    const report = complete();
    expect(validateBrowserEvidence({ ...report, rows: [{ ...report.rows[0], caseStatus: "SKIP" }, ...report.rows.slice(1)] }, identity).length).toBeGreaterThan(0);
  });
  it("accepts explicitly reference-only identity without claiming file verification", () => {
    const report = complete(); report.identity.canonicalContract.verification = { mode: "PINNED_REFERENCE", filePath: null, observedSha256: null };
    expect(validateBrowserEvidence(report, report.identity)).toEqual([]);
  });
  it("never reads a Contract file in PINNED_REFERENCE mode", () => {
    const reader = vi.fn(() => { throw new Error("must not read"); });
    expect(resolveContractBinding("PINNED_REFERENCE", undefined, "/nonexistent", reader).verification).toEqual({ mode: "PINNED_REFERENCE", filePath: null, observedSha256: null });
    expect(reader).not.toHaveBeenCalled();
  });
  it("rejects ambiguous, invalid, missing and mismatched inputs without fallback", () => {
    expect(() => resolveContractBinding("PINNED_REFERENCE", "/any", "/default")).toThrow(/forbids/);
    expect(() => resolveContractBinding("UNKNOWN", undefined, "/default")).toThrow(/Unknown/);
    expect(() => resolveContractBinding("FILE_SHA256", "/missing-ws06a-contract", "/default")).toThrow();
    expect(() => resolveContractBinding("FILE_SHA256", undefined, "/default", () => Buffer.from("wrong"))).toThrow(/mismatch/);
  });
});
