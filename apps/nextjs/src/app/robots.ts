import type { MetadataRoute } from "next";

import { INDEXABLE, SITE_URL } from "~/lib/site";

// Crawlers that collect pages to train models. Search and answer crawlers
// (Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot, PerplexityBot) stay
// allowed under `*`.
const AI_TRAINING_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Meta-ExternalAgent",
  "Bytespider",
  "cohere-training-data-crawler",
];

export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/entities/", "/linear-ds"],
      },
      { userAgent: AI_TRAINING_BOTS, disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
