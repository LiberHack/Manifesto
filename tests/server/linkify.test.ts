import { describe, it, expect } from "vitest";
import { linkify } from "../../shared/linkify";

describe("linkify", () => {
  it("keeps plain text as a single segment", () => {
    expect(linkify("no links here")).toEqual([{ type: "text", text: "no links here" }]);
  });

  it("turns http(s) URLs into links and leaves trailing punctuation as text", () => {
    expect(linkify("see https://example.org/repo.")).toEqual([
      { type: "text", text: "see " },
      { type: "link", text: "https://example.org/repo", href: "https://example.org/repo" },
      { type: "text", text: "." },
    ]);
  });

  it("never links other schemes", () => {
    expect(linkify("javascript:alert(1) data:text/html,x")).toEqual([
      { type: "text", text: "javascript:alert(1) data:text/html,x" },
    ]);
  });

  it("does not split markup-looking text into anything but text", () => {
    const segments = linkify('<img src=x onerror="alert(1)">');
    expect(segments.every((s) => s.type === "text")).toBe(true);
  });
});
