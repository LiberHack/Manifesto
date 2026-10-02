// Skill normalisation: canonical case from the catalogue, common aliases
// folded together. The caller keeps what was typed alongside the result
// (registrations.skills_input), so nothing the person wrote is lost.

const ALIASES: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  py: "Python",
  python3: "Python",
  golang: "Go",
  "c#": "C#",
  csharp: "C#",
  "c++": "C++",
  cpp: "C++",
  "node": "Node.js",
  nodejs: "Node.js",
  "node.js": "Node.js",
  react: "React",
  reactjs: "React",
  "react.js": "React",
  vue: "Vue",
  vuejs: "Vue",
  "vue.js": "Vue",
  nuxt: "Nuxt",
  nuxtjs: "Nuxt",
  next: "Next.js",
  nextjs: "Next.js",
  "next.js": "Next.js",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  psql: "PostgreSQL",
  k8s: "Kubernetes",
  kubernetes: "Kubernetes",
  ml: "Machine Learning",
  "machine learning": "Machine Learning",
  ai: "AI",
  "ui/ux": "UI/UX Design",
  "ux/ui": "UI/UX Design",
  ux: "UI/UX Design",
  ui: "UI/UX Design",
  figma: "Figma",
  rustlang: "Rust",
};

/** Lookup key: case- and inner-whitespace-insensitive. */
function key(skill: string): string {
  return skill.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Normalise a list of skills against the catalogue.
 *
 * Aliases resolve first, then the catalogue's spelling of a case-insensitive
 * match; anything else is kept as typed (trimmed). Duplicates after
 * normalisation collapse, keeping first-seen order.
 */
export function normalizeSkills(input: string[], catalogue: string[]): string[] {
  const canonical = new Map(catalogue.map((name) => [key(name), name]));
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of input) {
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    const alias = ALIASES[key(trimmed)];
    const resolved = canonical.get(key(alias ?? trimmed)) ?? alias ?? trimmed;
    const k = key(resolved);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(resolved);
  }

  return out;
}
