import { createHash } from "node:crypto";
import { z } from "zod";

import { legalActivationSchema, type PageInventoryEntry } from "../data/schemas/page-inventory";

const policyText = z.string().refine((value) => value.trim().length > 0, "Policy text must not be empty.");
const legalContentPayloadSchema = z.object({
  intro: policyText,
  sections: z.array(z.object({
    heading: policyText,
    paragraphs: z.array(policyText).min(1),
  }).strict()).min(1),
  notice: z.string().optional(),
}).strict();

export type LegalContentPayload = z.output<typeof legalContentPayloadSchema>;

export type LegalContent = Partial<Record<"privacy" | "terms", LegalContentPayload>>;

export interface ResolvedLegalPayload {
  title: string;
  intro: string;
  sections: LegalContentPayload["sections"];
  notice: string | null;
}

function normalizePolicyText(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function resolveLegalPayload(title: string, content: unknown): ResolvedLegalPayload {
  const payload = legalContentPayloadSchema.parse(content);
  return {
    title: normalizePolicyText(policyText.parse(title)),
    intro: normalizePolicyText(payload.intro),
    sections: payload.sections.map((section) => ({
      heading: normalizePolicyText(section.heading),
      paragraphs: section.paragraphs.map(normalizePolicyText),
    })),
    notice: payload.notice === undefined ? null : normalizePolicyText(payload.notice),
  };
}

export function canonicalizeLegalPayload(title: string, content: unknown): string {
  return JSON.stringify(resolveLegalPayload(title, content));
}

export function computeLegalContentSha256(title: string, content: unknown): string {
  return createHash("sha256").update(canonicalizeLegalPayload(title, content), "utf8").digest("hex");
}

export function resolveLegalPageSafety(
  page: PageInventoryEntry,
  content: LegalContent = {},
): { eligible: boolean; errors: string[]; payload?: ResolvedLegalPayload } {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(`TL-01 page "${page.pageId}": ${message}`);
  if (page.pageType !== "privacy" && page.pageType !== "terms") {
    if (page.legalActivation !== undefined) fail("legalActivation is only supported on legal pages.");
    return { eligible: errors.length === 0, errors };
  }

  if (page.route !== `/${page.pageType}/`) {
    fail(`Unsupported legal route "${page.route}"; ${page.pageType} requires /${page.pageType}/.`);
  }
  const activation = legalActivationSchema.safeParse(page.legalActivation ?? { state: "unavailable" });
  if (!activation.success) {
    fail(`Invalid legalActivation / approvedContentSha256: ${activation.error.message}`);
    return { eligible: false, errors };
  }
  if (activation.data.state === "unavailable") {
    if (page.visibility === "public") fail("Unavailable legal page must not use visibility=public.");
    if (page.publicationStatus !== "draft") fail("Unavailable legal page requires publicationStatus=draft.");
    if (page.indexability !== "noindex") fail("Unavailable legal page must use noindex.");
    return { eligible: false, errors };
  }

  if (page.visibility !== "public") fail("Active legal page requires visibility=public.");
  if (page.publicationStatus !== "published") fail("Active legal page requires publicationStatus=published.");
  if (!page.publishedAt) fail("Active legal page requires publishedAt.");
  if (page.contentStatus !== "ready") fail("Active legal page requires contentStatus=ready.");
  if (page.developmentStatus !== "ready") fail("Active legal page requires developmentStatus=ready.");
  if (page.needsReview !== false) fail("Active legal page requires needsReview=false.");
  if (page.needsUpdate !== false) fail("Active legal page requires needsUpdate=false.");

  let payload: ResolvedLegalPayload;
  try {
    payload = resolveLegalPayload(page.title, content[page.pageType]);
  } catch (error) {
    fail(`Invalid or missing legal content: ${error instanceof Error ? error.message : String(error)}`);
    return { eligible: false, errors };
  }
  const currentDigest = createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
  if (currentDigest !== activation.data.approvedContentSha256) {
    fail("approvedContentSha256 does not match the current policy digest; explicitly approve the current content before activation.");
  }
  return { eligible: errors.length === 0, errors, payload };
}
