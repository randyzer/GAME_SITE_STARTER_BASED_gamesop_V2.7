import { z } from "zod";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { validateBrowserEvidence, validateBrowserEvidenceSnapshot, type CoreBrowserEvidence, type EvidenceIdentity } from "./core-browser-evidence";

export const webkitPolicy = {
  id: "WS06A_WEBKIT_VERIFICATION_V1",
  proposalSha256: "2696a9d7ee691fad07ea7b557a4acab706bb408ea0c5583c3bfe7bd5fb85d917",
  arrowControlSha256: "1ff999e08c3c93d93baaca8260bee8c243c3e2367552e58ae9550473bc741344",
} as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().trim().min(1);
const manualBuildSchema = z.object({ fixtureIdentity: z.literal("Field Notes synthetic adoption"), fixtureSourceSha256: digest, distSha256: digest }).strict();
const hostSchema = z.object({ platform: z.literal("darwin"), arch: z.literal("arm64"), node: text.optional() }).strict();
const probeSchema = z.object({ schemaVersion: z.literal("1"), rawEvidenceSha256: digest, host: hostSchema,
  engine: z.object({ browserName: z.literal("webkit"), version: z.literal("26.6"), revision: z.literal("2359") }).strict(),
  webkit: z.object({ plainTabReachesLink: z.literal(false), sequence: z.array(z.object({ key: text, tag: text, text: z.string() }).strict()).min(1) }).strict(),
}).strict();
const alternateSchema = z.object({ schemaVersion: z.literal("1"), rawEvidenceSha256: digest,
  policy: z.object({ id: z.literal(webkitPolicy.id), proposalSha256: z.literal(webkitPolicy.proposalSha256), arrowControlSha256: z.literal(webkitPolicy.arrowControlSha256) }).strict(),
  starter: z.object({ branch: text, head: z.string().regex(/^[a-f0-9]{40}$/), workingTreeSha256: digest }).strict(),
  manualBuild: manualBuildSchema,
  browser: z.object({ product: z.literal("Safari"), version: z.string().regex(/^\d+\.\d+(?:\.\d+)*$/), engineFamily: z.literal("WebKit") }).strict(),
  host: hostSchema,
  input: z.object({ method: z.enum(["HUMAN_PHYSICAL_KEYBOARD", "AUTHORIZED_TRUSTED_SYSTEM_KEYBOARD"]), keyboardNavigationSettingChangedForTest: z.literal(false) }).strict(),
  review: z.object({ operator: text, observedAt: z.iso.datetime(), notes: text }).strict(),
  rows: z.array(z.object({ caseId: text, route: text,
    viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict(), javascript: z.boolean(),
    assertions: z.array(z.object({ name: text, result: z.literal("PASS"), disposition: z.enum(["ENVIRONMENT_PROFILE_BLOCKED", "PRODUCT_EVIDENCE_UNRESOLVED"]),
      observation: z.object({ keys: z.array(text).min(1), before: text, after: text, focusVisible: z.literal(true), artifact: text,
        scrollBefore: z.number().nonnegative().optional(), scrollAfter: z.number().nonnegative().optional(), trustedKeyReceived: z.boolean().optional() }).strict(),
    }).strict()).min(1),
  }).strict()).min(1),
}).strict();
export type ManualBuildIdentity = z.infer<typeof manualBuildSchema>;
type ClosureInput = { rawEvidence: unknown; expectedIdentity: EvidenceIdentity; nativeProbe?: unknown; realKeyboardEvidence?: unknown;
  expectedManualBuild?: ManualBuildIdentity; rawEvidenceSha256: string };
type Requirement = { caseId: string; route: string; viewport: { width: number; height: number }; javascript: boolean;
  assertions: Array<{ name: string; disposition: "ENVIRONMENT_PROFILE_BLOCKED" | "PRODUCT_EVIDENCE_UNRESOLVED" }> };
const plainNames = new Set(["skip-keyboard", "footer-keyboard", "navigation-keyboard", "target-size", "nested-cleanup", "ordinary-navigation", "same-document-focus", "recovery-navigation"]);
const plainTargets = new Set(["/", "/#top", "/guides/", "/guides/getting-started/"]);
function classify(name: string, detail: string): Requirement["assertions"][number]["disposition"] | null {
  if (plainNames.has(name) && (name === "skip-keyboard" && detail === "First Tab does not focus skip link" ||
    detail.startsWith("Target not keyboard reachable: ") && plainTargets.has(detail.slice("Target not keyboard reachable: ".length)))) return "ENVIRONMENT_PROFILE_BLOCKED";
  if (name !== "table-local-scroll" || !detail.startsWith("Native ArrowRight did not scroll: ")) return null;
  try {
    const data = JSON.parse(detail.slice("Native ArrowRight did not scroll: ".length));
    const g = data.geometry;
    if (data.before.active === true && data.after.active === true && data.before.scroll === 0 && data.after.scroll === 0 && data.after.key === "ArrowRight" &&
      ["auto", "scroll"].includes(g.overflow) && Number.isFinite(g.wrapperClient) && g.wrapperClient > 0 && g.wrapperScroll > g.wrapperClient + 1 &&
      g.tableWidth > g.wrapperClient + 1 && g.documentClient > 0 && g.documentScroll <= g.documentClient + 1) return "PRODUCT_EVIDENCE_UNRESOLVED";
  } catch { /* A changed or malformed oracle is outside this accepted policy. */ }
  return null;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function verifyBrowserClosure(input: ClosureInput) {
  const errors = validateBrowserEvidenceSnapshot(input.rawEvidence, input.expectedIdentity);
  const requirements: Requirement[] = [];
  const blocked = () => ({ decision: "BLOCKED" as const, errors, requirements });
  if (!digest.safeParse(input.rawEvidenceSha256).success) errors.push("raw evidence digest missing/invalid");
  if (errors.length) return blocked();
  const raw = input.rawEvidence as CoreBrowserEvidence;
  if (raw.identity.canonicalContract.verification?.mode !== "FILE_SHA256") errors.push("closure requires actual Contract file binding");
  if (!errors.length && validateBrowserEvidence(raw, input.expectedIdentity).length === 0)
    return { decision: "RAW_QUALIFICATION_COMPLETE" as const, errors, requirements };
  if (raw.identity.host.platform !== "darwin" || raw.identity.host.arch !== "arm64" || raw.identity.engines.webkit.version !== "26.6" || raw.identity.engines.webkit.revision !== "2359")
    errors.push("accepted engine/host control identity mismatch");
  if (raw.infrastructureErrors.some(e => e !== "WEBKIT_STANDARD_TAB_LINK_PROFILE_UNAVAILABLE")) errors.push("unknown infrastructure failure");
  for (const row of raw.rows.filter(r => r.caseStatus === "FAIL")) {
    if (row.engine !== "webkit" || !["baseline", "no-js"].includes(row.category)) { errors.push(row.caseId + ": failure outside policy"); continue; }
    const assertions: Requirement["assertions"] = [];
    for (const a of row.assertions.filter(a => !a.passed)) {
      const disposition = classify(a.name, a.detail);
      if (!disposition) errors.push(row.caseId + ": unknown failure " + a.name);
      else assertions.push({ name: a.name, disposition });
    }
    requirements.push({ caseId: row.caseId, route: row.route, viewport: row.viewport, javascript: row.javascript, assertions });
  }
  if (!requirements.length) errors.push("no policy-covered failed rows");
  const probe = probeSchema.safeParse(input.nativeProbe);
  if (!probe.success) errors.push("missing/invalid bound native probe");
  else {
    if (probe.data.rawEvidenceSha256 !== input.rawEvidenceSha256 || !same(probe.data.engine, raw.identity.engines.webkit) ||
      probe.data.host.platform !== raw.identity.host.platform || probe.data.host.arch !== raw.identity.host.arch) errors.push("native probe identity mismatch");
    if (probe.data.webkit.sequence.some(s => s.key === "Tab" && s.tag === "A") || !probe.data.webkit.sequence.some(s => s.key === "Tab" && s.tag !== "BODY"))
      errors.push("native probe does not establish unavailable standard link traversal");
  }
  const alternate = alternateSchema.safeParse(input.realKeyboardEvidence);
  if (!alternate.success) errors.push("missing/invalid real Safari keyboard evidence");
  else {
    const proof = alternate.data;
    if (proof.rawEvidenceSha256 !== input.rawEvidenceSha256 || !same(proof.starter, input.expectedIdentity.starter) ||
      !manualBuildSchema.safeParse(input.expectedManualBuild).success || !same(proof.manualBuild, input.expectedManualBuild) ||
      input.expectedManualBuild?.fixtureSourceSha256 !== input.expectedIdentity.fixture.sourceSha256) errors.push("alternate source/build identity mismatch");
    if (proof.host.platform !== raw.identity.host.platform || proof.host.arch !== raw.identity.host.arch) errors.push("alternate host mismatch");
    if (proof.rows.length !== requirements.length || new Set(proof.rows.map(r => r.caseId)).size !== proof.rows.length) errors.push("alternate case coverage mismatch");
    for (const row of proof.rows) {
      const required = requirements.find(r => r.caseId === row.caseId);
      if (!required || row.route !== required.route || !same(row.viewport, required.viewport) || row.javascript !== required.javascript) { errors.push(row.caseId + ": alternate case identity mismatch"); continue; }
      if (row.assertions.length !== required.assertions.length || new Set(row.assertions.map(a => a.name)).size !== row.assertions.length) errors.push(row.caseId + ": alternate assertion coverage mismatch");
      for (const a of row.assertions) {
        const requirement = required.assertions.find(r => r.name === a.name);
        if (!requirement || a.disposition !== requirement.disposition) errors.push(row.caseId + ": alternate disposition mismatch");
        if (a.observation.keys.some(k => /alt|option|modifier/i.test(k))) errors.push(row.caseId + ": modifier workaround forbidden");
        if (a.name === "table-local-scroll" && (!a.observation.keys.includes("ArrowRight") || a.observation.trustedKeyReceived !== true ||
          a.observation.scrollBefore === undefined || a.observation.scrollAfter === undefined || a.observation.scrollAfter <= a.observation.scrollBefore)) errors.push(row.caseId + ": real native ArrowRight evidence missing");
        if (a.name !== "table-local-scroll" && !a.observation.keys.includes("Tab")) errors.push(row.caseId + ": real sequential keyboard path missing");
      }
    }
  }
  return errors.length ? blocked() : { decision: "WS06A_CLOSURE_ELIGIBLE_FOR_INDEPENDENT_REVIEW" as const, errors, requirements };
}

export function sourceManifest(base: string): string {
  const files: Array<{ path: string; sha256: string; mode: number; symlink: boolean }> = [];
  const excluded = new Set([".git", "node_modules", "dist", ".astro", ".astro-cache", ".vite-cache", ".vitest-cache", ".wrangler", "coverage", ".browser-evidence", ".DS_Store"]);
  function visit(dir: string) {
    for (const name of readdirSync(dir).sort()) {
      if (excluded.has(name) || name.startsWith(".env")) continue;
      const path = join(dir, name), s = lstatSync(path);
      if (s.isDirectory()) visit(path);
      else files.push({ path: relative(base, path), sha256: createHash("sha256").update(s.isSymbolicLink() ? readlinkSync(path) : readFileSync(path)).digest("hex"), mode: s.mode & 0o777, symlink: s.isSymbolicLink() });
    }
  }
  visit(base); return createHash("sha256").update(JSON.stringify(files)).digest("hex");
}
function main() {
  const required = (name: string) => { const value = process.env[name]; if (!value) throw Error(name + " required"); return value; };
  const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  const rawPath = required("WS06A_BROWSER_EVIDENCE");
  // Captured independently by the fresh build/session owner; never use report.identity as its own oracle.
  const expected = read(required("WS06A_EXPECTED_IDENTITY")) as EvidenceIdentity;
  const root = process.cwd();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  if (expected.starter.workingTreeSha256 !== sourceManifest(root) || expected.starter.head !== git("rev-parse", "HEAD") || expected.starter.branch !== git("branch", "--show-current")) throw Error("current Starter differs from independently captured identity");
  const contract = expected.canonicalContract.verification;
  if (contract?.mode !== "FILE_SHA256" || createHash("sha256").update(readFileSync(contract.filePath)).digest("hex") !== contract.observedSha256) throw Error("actual canonical Contract not bound");
  let manualBuild: ManualBuildIdentity | undefined;
  if (process.env.WS06A_MANUAL_PROJECT_ROOT) {
    const base = process.env.WS06A_MANUAL_PROJECT_ROOT;
    manualBuild = { fixtureIdentity: "Field Notes synthetic adoption", fixtureSourceSha256: sourceManifest(base), distSha256: sourceManifest(join(base, "dist")) };
  }
  const result = verifyBrowserClosure({ rawEvidence: read(rawPath), expectedIdentity: expected,
    rawEvidenceSha256: createHash("sha256").update(readFileSync(rawPath)).digest("hex"),
    nativeProbe: process.env.WS06A_NATIVE_PROBE ? read(process.env.WS06A_NATIVE_PROBE) : undefined,
    realKeyboardEvidence: process.env.WS06A_REAL_KEYBOARD_EVIDENCE ? read(process.env.WS06A_REAL_KEYBOARD_EVIDENCE) : undefined,
    expectedManualBuild: manualBuild });
  if (result.decision !== "RAW_QUALIFICATION_COMPLETE") {
    for (const [name, digest] of [["WS06A_POLICY_PROPOSAL", webkitPolicy.proposalSha256], ["WS06A_ARROW_CONTROL", webkitPolicy.arrowControlSha256]]) {
      const path = required(name);
      if (createHash("sha256").update(readFileSync(path)).digest("hex") !== digest) throw Error(name + " accepted policy/control bytes mismatch");
    }
  }
  if (result.decision === "WS06A_CLOSURE_ELIGIBLE_FOR_INDEPENDENT_REVIEW") {
    const proofPath = resolve(required("WS06A_REAL_KEYBOARD_EVIDENCE"));
    const proof = alternateSchema.parse(read(proofPath));
    for (const row of proof.rows) for (const assertion of row.assertions) {
      const artifact = resolve(dirname(proofPath), assertion.observation.artifact);
      if (!artifact.startsWith(dirname(proofPath) + "/") || artifact === proofPath || !/\.(png|jpe?g|webm|mp4|json)$/.test(artifact)) throw Error("Invalid local observation artifact reference");
      const file = lstatSync(artifact);
      if (!file.isFile() || file.isSymbolicLink() || file.size === 0) throw Error("Observation artifact missing/empty");
    }
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(String(error)); process.exitCode = 1; }
}
