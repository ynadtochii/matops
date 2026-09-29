export interface EmailContent {
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  footer: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#282a30";
const MUTED = "#6b6e76";
const PAGE = "#f4f4f5";
const LINE = "#e4e4e7";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Tables and inline styles only: Gmail and Outlook drop `<style>` blocks.
export function renderEmail(content: EmailContent): RenderedEmail {
  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${INK};">${escapeHtml(p)}</p>`,
    )
    .join("");
  const button = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px;"><tr><td style="border-radius:8px;background:${INK};"><a href="${escapeHtml(content.cta.url)}" style="display:inline-block;padding:12px 20px;font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(content.cta.label)}</a></td></tr></table>`
    : "";

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(content.heading)}</title></head><body style="margin:0;padding:0;background:${PAGE};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;"><tr><td style="padding:32px;font-family:${FONT};"><h1 style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:600;color:${INK};">${escapeHtml(content.heading)}</h1>${paragraphs}${button}</td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;"><tr><td style="padding:16px 32px;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">${escapeHtml(content.footer)}<br>Sent by MatOps</td></tr></table></td></tr></table></body></html>`;

  const text = [
    ...content.paragraphs,
    ...(content.cta ? [`${content.cta.label}: ${content.cta.url}`] : []),
    "--",
    content.footer,
  ].join("\n\n");

  return { html, text };
}
