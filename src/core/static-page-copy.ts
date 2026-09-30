export type StaticPageType = "about" | "privacy" | "terms";

export interface StaticPageCopy {
  intro: string;
  reviewNotice?: string;
  sections: Array<{
    heading: string;
    paragraphs: string[];
  }>;
}

const reviewNotice =
  "This is starter text, not legal advice. Replace it after qualified legal review for your business, jurisdiction, hosting, analytics, advertising, and data practices.";

const staticPageCopy = {
  about: {
    intro:
      "Game Atlas is a reusable editorial system for answering game questions with less noise and clearer evidence.",
    sections: [
      {
        heading: "Sources before claims",
        paragraphs: [
          "Every factual record carries a source URL, access date, evidence note, and confidence level. Community observations can inform analysis, but they are never silently presented as official facts.",
        ],
      },
      {
        heading: "Facts live once",
        paragraphs: [
          "Patch-sensitive values live in structured fact files. Entity pages, databases, guides, and tools reuse that source instead of copying numbers across unrelated documents.",
        ],
      },
      {
        heading: "Publishing is a deliberate gate",
        paragraphs: [
          "A page appears only after its inventory record is public, published, implemented, and allowed by its feature flag. Facts alone never create thin pages.",
        ],
      },
    ],
  },
  privacy: {
    intro:
      "This starter is static by default and does not include accounts, contact forms, behavioral analytics, advertising pixels, or a customer database.",
    reviewNotice,
    sections: [
      {
        heading: "Data handling defaults",
        paragraphs: [
          "The shipped interface does not ask visitors to submit personal information. If you add forms, analytics, advertising, embedded media, or account features, document those systems here before launch.",
        ],
      },
      {
        heading: "Hosting and technical logs",
        paragraphs: [
          "Your hosting and security providers may process IP addresses, request headers, and diagnostic logs to deliver and protect the site. Identify your actual providers, retention periods, and legal basis.",
        ],
      },
      {
        heading: "External sources and links",
        paragraphs: [
          "Evidence links lead to third-party sites with their own policies. Visiting those services is governed by the destination provider, not this starter.",
        ],
      },
    ],
  },
  terms: {
    intro:
      "These starter terms describe an informational game guide site. They must be adapted to the operator, content rights, monetization, audience, and governing law.",
    reviewNotice,
    sections: [
      {
        heading: "Editorial and informational use",
        paragraphs: [
          "Guides, rankings, and tools are provided for general informational purposes. Game balance, availability, and platform behavior can change after publication.",
        ],
      },
      {
        heading: "Names, marks, and source material",
        paragraphs: [
          "Game names and marks belong to their respective owners. Replace this paragraph with the attribution, license, fair-use position, and takedown process appropriate to the real project.",
        ],
      },
      {
        heading: "Availability and changes",
        paragraphs: [
          "The operator may correct, update, or remove content as facts change. Add the warranty, liability, dispute, and governing-law provisions required for the production business.",
        ],
      },
    ],
  },
} satisfies Record<StaticPageType, StaticPageCopy>;

export function getStaticPageCopy(pageType: StaticPageType): StaticPageCopy {
  if (pageType !== "about") {
    throw new Error("Legal pages require explicitly approved project legal content; starter copy is not renderable.");
  }
  return staticPageCopy.about;
}
