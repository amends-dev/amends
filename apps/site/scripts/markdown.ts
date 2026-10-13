/**
 * The Markdown the documentation's generator writes, as pure transforms: a README into a guide
 * whose links reach the site or the repository, and docgen's module pages into Starlight's.
 */
import { posix } from "node:path";

/** YAML front matter. JSON strings are valid YAML scalars, so values are written as JSON. */
export function frontmatter(fields: Record<string, unknown>): string {
  const lines = Object.entries(fields).map(([key, value]) => {
    if (value !== null && typeof value === "object") {
      const nested = Object.entries(value).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`);
      return `${key}:\n${nested.join("\n")}`;
    }
    return `${key}: ${JSON.stringify(value)}`;
  });
  return `---\n${lines.join("\n")}\n---\n`;
}

/** What a link in a README needs to know about where it is and what the repository holds. */
export interface LinkContext {
  readonly repository: string;
  /** The README's directory, from the repository's root, such as "packages/harness". */
  readonly directory: string;
  /** The guide's path when `file` is a published package's directory or its README. */
  readonly guideFor: (file: string) => string | undefined;
  readonly isDirectory: (file: string) => boolean;
}

/**
 * Where a README's link leads on the site: another published package's README becomes its guide,
 * an anchor or an address stays, and any other file in the repository opens on GitHub.
 */
export function linkTarget(target: string, context: LinkContext): string {
  if (/^[a-z][a-z+.-]*:/i.test(target) || target.startsWith("#")) return target;
  const [path = "", anchor] = target.split("#", 2);
  const hash = anchor === undefined ? "" : `#${anchor}`;
  const file = posix.normalize(posix.join(context.directory, path)).replace(/\/$/, "");
  const guide = context.guideFor(file);
  if (guide !== undefined) return `${guide}${hash}`;
  const kind = context.isDirectory(file) ? "tree" : "blob";
  return `${context.repository}/${kind}/main/${file}${hash}`;
}

/** A README as a guide's body: without its title, which the page sets, and with its links led. */
export function guideBody(readme: string, link: (target: string) => string): string {
  return outsideCode(readme.replace(/^# .*\n+/, ""), (text) => rewriteLinks(text, link));
}

/** Applies `rewrite` to the text outside fenced code blocks. */
export function outsideCode(markdown: string, rewrite: (text: string) => string): string {
  return markdown
    .split(/(^```[\s\S]*?^```$)/m)
    .map((part, index) => (index % 2 === 0 ? rewrite(part) : part))
    .join("");
}

/** Rewrites the targets of inline links and of link reference definitions. */
export function rewriteLinks(text: string, rewrite: (target: string) => string): string {
  return text
    .replace(/\]\(([^)\s]+)\)/g, (_match, target: string) => `](${rewrite(target)})`)
    .replace(/^(\[[^\]]+\]:\s+)(\S+)/gm, (_match, label: string, target: string) => {
      return `${label}${rewrite(target)}`;
    });
}

/** A module docgen documented, from its page's path under docs/modules. */
export interface ModuleFile {
  /** Its source under src, such as "Harness.ts" or "conformance/index.ts". */
  readonly source: string;
  /** What the reference calls it: "Harness", or a folder's entry point by its folder. */
  readonly name: string;
  /** Its page's name, such as "harness" or "conformance-fixture". */
  readonly slug: string;
}

export function moduleFile(page: string): ModuleFile {
  const source = page.replace(/\.md$/, "");
  const name = source.replace(/\.ts$/, "").replace(/\/index$/, "");
  return { source, name, slug: name.toLowerCase().replaceAll("/", "-") };
}

/**
 * docgen's page for a module as a Starlight page's body: without Jekyll's front matter, the
 * overview heading, or the table of contents (Starlight draws one), with each category a section
 * and each export a heading under it. Code is left as it is.
 */
export function referenceBody(markdown: string): string {
  const lines = markdown.replace(/^---\n[\s\S]*?\n---\n/, "").split("\n");
  const kept: Array<string> = [];
  let inCode = false;
  let inContents = false;
  for (const line of lines) {
    const fence = line.startsWith("```");
    if (inCode || fence) {
      if (fence) inCode = !inCode;
      kept.push(line);
      continue;
    }
    if (line === "## Exports Grouped by Category") inContents = true;
    else if (inContents) inContents = line !== "---";
    else if (line === "---" || /^## \S+\.ts overview$/.test(line)) continue;
    else if (line.startsWith("# ")) kept.push(`## ${capitalize(line.slice(2))}`);
    else if (line.startsWith("## ")) kept.push(`### ${line.slice(3)}`);
    else kept.push(line);
  }
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The first sentence of the first paragraph of prose, for a page's description. */
export function firstSentence(markdown: string): string {
  const paragraph = markdown.split(/\n\s*\n/).find((part) => /^[A-Za-z`]/.test(part.trim())) ?? "";
  const flat = paragraph.replace(/\s+/g, " ").trim();
  const end = flat.search(/[.:](\s|$)/);
  return (end === -1 ? flat : flat.slice(0, end + 1)).replace(/:$/, ".");
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
