import { describe, expect, it } from "vitest";

import { renderEmail } from "../src/email";

describe("renderEmail", () => {
  const content = {
    heading: "Class cancelled",
    paragraphs: [
      "Fundamentals on Sat 15 Aug, 18:00 at Kyiv BJJ was cancelled.",
    ],
    cta: { label: "Find another class", url: "https://matops.app/entities/e1" },
    footer: "You got this email because you booked Fundamentals at Kyiv BJJ.",
  };

  it("puts the heading, body, button and footer in the html", () => {
    const { html } = renderEmail(content);
    expect(html).toContain("Class cancelled");
    expect(html).toContain("was cancelled.");
    expect(html).toContain('href="https://matops.app/entities/e1"');
    expect(html).toContain("Find another class");
    expect(html).toContain("You got this email because");
  });

  it("gives the text version the link spelled out", () => {
    const { text } = renderEmail(content);
    expect(text).toContain(
      "Find another class: https://matops.app/entities/e1",
    );
    expect(text).toContain(content.footer);
    expect(text).not.toContain("<");
  });

  it("leaves the button out when there is no cta", () => {
    const { html, text } = renderEmail({ ...content, cta: undefined });
    expect(html).not.toContain("<a ");
    expect(text).not.toContain("https://");
  });

  it("escapes staff-typed values and urls", () => {
    const { html } = renderEmail({
      ...content,
      heading: "<script>alert(1)</script>",
      paragraphs: ["Tom & Jerry's BJJ"],
      cta: { label: "Go", url: 'https://x.test/?a="><img src=x>' },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Tom &amp; Jerry&#39;s BJJ");
    expect(html).not.toContain('"><img');
  });
});
