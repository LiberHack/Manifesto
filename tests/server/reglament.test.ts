import { describe, it, expect } from "vitest";
import { fetch } from "@nuxt/test-utils/e2e";

describe("/reglament", () => {
  it("renders the reglament markdown, including its MDC sections", async () => {
    const html = await (await fetch("/reglament")).text();

    // Frontmatter fields rendered by the page shell.
    expect(html).toContain("Edition 2 · 27-29 ноември 2026");
    expect(html).toContain("Последна актуализация: 10.09.2026");
    // Section component: anchor, numbering and heading come from MDC props.
    expect(html).toContain('id="napravleniya"');
    expect(html).toContain("04. Проекти и направления");
    // Prop-driven components inside the markdown body.
    expect(html).toContain("Техническо майсторство и Сигурност");
    expect(html).toContain("1-во място - TBA");
  });
});
