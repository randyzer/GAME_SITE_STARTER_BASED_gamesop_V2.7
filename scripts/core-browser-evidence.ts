import { z } from "zod";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { browserEngines, coreBrowserMatrix, validateMatrix } from "./core-browser-matrix";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const canonicalContractReference = {
  version: "2.7", owningArtifact: "GAME_SOP",
  canonicalPath: "docs/COMMERCIAL_GAME_SITE_PRODUCT_CONTRACT_V2.7.md",
  sha256: "1ff2bd01a089975c6b22bff48ca71faffe2be9c710d0123afd3ae47acc7ac24c",
} as const;
const contractSchema = z.object({
  reference: z.object({ version: z.literal(canonicalContractReference.version), owningArtifact: z.literal(canonicalContractReference.owningArtifact),
    canonicalPath: z.literal(canonicalContractReference.canonicalPath), sha256: z.literal(canonicalContractReference.sha256) }).strict(),
  verification: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("FILE_SHA256"), filePath: z.string().min(1), observedSha256: z.literal(canonicalContractReference.sha256) }).strict(),
    z.object({ mode: z.literal("PINNED_REFERENCE"), filePath: z.null(), observedSha256: z.null() }).strict(),
  ]).nullable(),
}).strict();

export function resolveContractBinding(mode: string | undefined, path: string | undefined, defaultPath: string,
  readContract: (path: string) => Buffer = readFileSync): z.infer<typeof contractSchema> {
  if (mode === "PINNED_REFERENCE") {
    if (path !== undefined) throw new Error("PINNED_REFERENCE forbids CORE_BROWSER_CONTRACT_PATH");
    return { reference: canonicalContractReference, verification: { mode, filePath: null, observedSha256: null } };
  }
  if (mode !== undefined && mode !== "FILE_SHA256") throw new Error(`Unknown Contract mode: ${mode}`);
  const filePath = path ?? defaultPath;
  const observedSha256 = createHash("sha256").update(readContract(filePath)).digest("hex");
  if (observedSha256 !== canonicalContractReference.sha256) throw new Error("Canonical Contract file SHA256 mismatch");
  return { reference: canonicalContractReference, verification: { mode: "FILE_SHA256", filePath, observedSha256 } };
}
const version = z.string().regex(/^\d+\.\d+(?:\.\d+)*$/);
const engineIdentity = z.object({ browserName: z.enum(browserEngines), version, revision: z.string().regex(/^\d+$/) }).strict();
const identitySchema = z.object({
  starter: z.object({ branch: z.string().min(1), head: z.string().regex(/^[a-f0-9]{40}$/), workingTreeSha256: digest }).strict(),
  canonicalContract: contractSchema,
  fixture: z.object({ identity: z.literal("Field Notes synthetic adoption"), sourceSha256: digest }).strict(),
  build: z.object({ distSha256: digest }).strict(),
  playwright: z.object({ packageVersion: z.literal("1.63.0") }).strict(),
  host: z.object({ platform: z.string().min(1), arch: z.string().min(1), node: z.string().min(1) }).strict(),
  engines: z.object({ chromium: engineIdentity, firefox: engineIdentity, webkit: engineIdentity }).strict(),
}).strict();
const rowSchema = z.object({
  caseId: z.string(), category: z.enum(["baseline", "no-js", "boundary", "reduced-motion", "live-resize"]),
  engine: z.enum(browserEngines), browserVersion: version, browserRevision: z.string().regex(/^\d+$/),
  role: z.enum(["shell-nav", "content-detail", "recovery-404"]), route: z.string(),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  javascript: z.boolean(), reducedMotion: z.enum(["reduce", "no-preference"]),
  sourceSha256: digest, buildSha256: digest, httpStatus: z.number().int(),
  assertions: z.array(z.object({ name: z.string(), passed: z.boolean(), detail: z.string().min(1) }).strict()),
  caseStatus: z.enum(["PASS", "FAIL", "NOT_RUN"]), durationMs: z.number().nonnegative(), failure: z.string().nullable(),
}).strict();
const reportSchema = z.object({
  schemaVersion: z.literal("1"), identity: identitySchema, rows: z.array(rowSchema),
  overall: z.enum(["PASS", "FAIL"]), infrastructureErrors: z.array(z.string()),
  cleanup: z.object({ previewStopped: z.boolean(), fixtureRemoved: z.boolean() }).strict(),
  humanReview: z.object({ visualFocus: z.literal("DEFERRED"), contrast: z.literal("DEFERRED") }).strict(),
}).strict();

export type EvidenceIdentity = z.infer<typeof identitySchema>;
export type BrowserEvidenceRow = z.infer<typeof rowSchema>;
export type CoreBrowserEvidence = z.infer<typeof reportSchema>;

// Expected identity comes from the running source/build, never from the report being checked.
export function validateBrowserEvidence(input: unknown, expected: EvidenceIdentity): string[] {
  return validateSnapshot(input, expected, true);
}

// Read failed runs without changing the strict qualification gate above.
export function validateBrowserEvidenceSnapshot(input: unknown, expected: EvidenceIdentity): string[] {
  return validateSnapshot(input, expected, false);
}

function validateSnapshot(input: unknown, expected: EvidenceIdentity, requirePass: boolean): string[] {
  const errors = validateMatrix();
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return [...errors, ...parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)];
  const report = parsed.data;
  if (report.identity.canonicalContract.verification === null) errors.push("Contract input not verified/bound");
  if (JSON.stringify(report.identity) !== JSON.stringify(identitySchema.parse(expected))) errors.push("source/build/engine identity mismatch");
  if (requirePass && (report.overall !== "PASS" || report.infrastructureErrors.length)) errors.push("overall/infrastructure failure");
  if (!requirePass && report.overall !== (report.rows.every(row => row.caseStatus === "PASS") && !report.infrastructureErrors.length ? "PASS" : "FAIL")) errors.push("inconsistent overall status");
  if (!report.cleanup.previewStopped || !report.cleanup.fixtureRemoved) errors.push("cleanup incomplete");
  if (report.rows.length !== 47) errors.push("47 evidence rows required");
  const seen = new Set<string>();
  for (const row of report.rows) {
    if (seen.has(row.caseId)) errors.push(`duplicate case ${row.caseId}`);
    seen.add(row.caseId);
    const planned = coreBrowserMatrix.find((item) => item.caseId === row.caseId);
    if (!planned) { errors.push(`unexpected case ${row.caseId}`); continue; }
    for (const key of ["category", "engine", "role", "route", "javascript", "reducedMotion"] as const) {
      if (row[key] !== planned[key]) errors.push(`${row.caseId}: ${key} mismatch`);
    }
    if (JSON.stringify(row.viewport) !== JSON.stringify(planned.viewport)) errors.push(`${row.caseId}: viewport mismatch`);
    const engine = expected.engines[planned.engine];
    if (engine.browserName !== planned.engine || row.browserVersion !== engine.version || row.browserRevision !== engine.revision) errors.push(`${row.caseId}: engine identity mismatch`);
    if (row.sourceSha256 !== expected.fixture.sourceSha256 || row.buildSha256 !== expected.build.distSha256) errors.push(`${row.caseId}: build/source mismatch`);
    if (row.httpStatus !== (planned.role === "recovery-404" ? 404 : 200)) errors.push(`${row.caseId}: HTTP status mismatch`);
    if (requirePass && (row.caseStatus !== "PASS" || row.failure !== null)) errors.push(`${row.caseId}: case did not pass`);
    if (!requirePass && (row.caseStatus === "NOT_RUN" || (row.caseStatus === "PASS") !== row.assertions.every(a => a.passed) ||
      (row.caseStatus === "PASS" ? row.failure !== null : !row.failure))) errors.push(`${row.caseId}: incomplete/inconsistent case`);
    const names = row.assertions.map((assertion) => assertion.name);
    if (names.length !== planned.requiredAssertions.length || new Set(names).size !== names.length ||
      planned.requiredAssertions.some((name) => !names.includes(name))) errors.push(`${row.caseId}: assertion coverage mismatch`);
    if (requirePass && row.assertions.some((assertion) => !assertion.passed)) errors.push(`${row.caseId}: assertion failed`);
  }
  for (const planned of coreBrowserMatrix) if (!seen.has(planned.caseId)) errors.push(`missing case ${planned.caseId}`);
  return errors;
}
