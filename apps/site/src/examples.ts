/**
 * Code the pages show, read from where the repository documents it, so the site never shows an
 * example the repository does not: a README's quick start, or a titled example in a doc comment,
 * which docgen typechecks as the documentation is generated.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./catalog.ts";

/** The first TypeScript block under the `## Quick start` heading of `directory`'s README. */
export function quickStart(directory: string): string {
  const readme = readFileSync(join(root, directory, "README.md"), "utf8");
  const section = readme.split(/^## /m).find((part) => part.startsWith("Quick start\n"));
  const code = section?.match(/```ts\n([\s\S]*?)\n```/)?.[1];
  if (code === undefined) throw new Error(`${directory}/README.md has no TypeScript quick start.`);
  return code;
}

/** The example titled `title` in a doc comment of `file`, such as "Providing the harness to a program". */
export function docExample(file: string, title: string): string {
  const source = readFileSync(join(root, file), "utf8");
  const start = source.indexOf(`**Example** (${title})`);
  const code =
    start === -1 ? undefined : source.slice(start).match(/```ts\n([\s\S]*?)\n\s*\* ```/)?.[1];
  if (code === undefined) throw new Error(`${file} has no example titled "${title}".`);
  return code
    .split("\n")
    .map((line) => line.replace(/^\s*\* ?/, ""))
    .join("\n");
}
