import type { MetadataRoute } from "next";

import { INDEXABLE, SITE_URL } from "~/lib/site";

// Crawls hard and is known to ignore crawl limits. Every other crawler,
// including the AI training ones, may read the public pages.
const BLOCKED_BOTS = ["Bytespider"];

export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/entities/", "/linear-ds"],
      },
      { userAgent: BLOCKED_BOTS, disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
