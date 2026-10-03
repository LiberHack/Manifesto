import { describe, it, expect } from "vitest";
import { fill } from "../../server/utils/email";

describe("fill", () => {
  it("substitutes every occurrence of a placeholder", () => {
    expect(fill("{{A}} and {{A}}", { A: "x" })).toBe("x and x");
  });

  it("HTML-escapes user-controlled values", () => {
    expect(
      fill("<p>{{NAME}}</p>", { NAME: `<a href="https://evil.test">Ada</a> & 'co'` }),
    ).toBe(
      "<p>&lt;a href=&quot;https://evil.test&quot;&gt;Ada&lt;/a&gt; &amp; &#39;co&#39;</p>",
    );
  });
});
