type MinimarkNode = string | [string, Record<string, unknown>, ...MinimarkNode[]];

function isTag(node: unknown, tag: string): node is Exclude<MinimarkNode, string> {
  return Array.isArray(node) && node[0] === tag;
}

function childrenOf(node: unknown): MinimarkNode[] {
  if (!Array.isArray(node)) return [];
  return typeof node[0] === "string" ? node.slice(2) : node;
}

function textOf(node: MinimarkNode): string {
  return typeof node === "string" ? node : childrenOf(node).map(textOf).join("");
}

function labelTables(node: unknown): void {
  if (isTag(node, "table")) {
    const head = childrenOf(node).find((child) => isTag(child, "thead"));
    const headerRow = childrenOf(head).find((child) => isTag(child, "tr"));
    const headers = childrenOf(headerRow)
      .filter((child) => isTag(child, "th"))
      .map((child) => textOf(child).trim());
    const body = childrenOf(node).find((child) => isTag(child, "tbody"));
    for (const row of childrenOf(body)) {
      if (!isTag(row, "tr")) continue;
      childrenOf(row)
        .filter((cell) => isTag(cell, "td"))
        .forEach((cell, index) => {
          (cell as Exclude<MinimarkNode, string>)[1]["data-label"] = headers[index] ?? "";
        });
    }
  }
  for (const child of childrenOf(node)) labelTables(child);
}

/**
 * Give rendered markdown table cells their column header as `data-label`, so
 * ProseTable can show each row as a labelled stack on phones. Runs before SSR
 * on Nuxt Content's minimark body; idempotent.
 */
export function labelContentTableCells(body: unknown): void {
  if (body && typeof body === "object" && "type" in body && body.type === "minimark" && "value" in body) {
    labelTables(body.value);
  }
}
