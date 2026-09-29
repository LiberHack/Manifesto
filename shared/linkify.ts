// Split chat text into plain-text and link segments so messages can be
// rendered with text interpolation only (never v-html). Only http(s) URLs
// become links.

export type Segment = { type: "text"; text: string } | { type: "link"; text: string; href: string };

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;
// Punctuation that usually ends a sentence rather than the URL.
const TRAILING = /[.,;:!?)\]]+$/;

export function linkify(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const trailing = raw.match(TRAILING)?.[0] ?? "";
    const candidate = raw.slice(0, raw.length - trailing.length);

    let href: string | null = null;
    try {
      const url = new URL(candidate);
      if (url.protocol === "http:" || url.protocol === "https:") href = url.toString();
    } catch {
      href = null;
    }
    if (!href) continue;

    if (start > last) segments.push({ type: "text", text: text.slice(last, start) });
    segments.push({ type: "link", text: candidate, href });
    last = start + candidate.length;
  }

  if (last < text.length) segments.push({ type: "text", text: text.slice(last) });
  return segments;
}
