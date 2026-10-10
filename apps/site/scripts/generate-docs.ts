/**
 * Generates the documentation that comes from the repository, before Astro builds the site: each
 * published package's guide from its README, and its API reference from its source with docgen,
 * which also typechecks the examples in its doc comments. Both land in gitignored folders under
 * src/content/docs/docs, where Starlight reads them beside the written pages.
 */
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  links,
  publishedPackages,
  repository,
  root,
  type PublishedPackage,
} from "../src/catalog.ts";
import {
  firstSentence,
  frontmatter,
  guideBody,
  linkTarget,
  moduleFile,
  referenceBody,
  type ModuleFile,
} from "./markdown.ts";

const docs = resolve(import.meta.dir, "../src/content/docs/docs");
const guides = join(docs, "packages");
const reference = join(docs, "api");

/** How docgen typechecks the examples: as the packages' own sources are, with Bun's types. */
const examplesCompilerOptions = {
  noEmit: true,
  strict: true,
  skipLibCheck: true,
  module: "preserve",
  moduleResolution: "bundler",
  target: "esnext",
  lib: ["esnext"],
  allowImportingTsExtensions: true,
  types: ["bun"],
};

await rm(guides, { recursive: true, force: true });
await rm(reference, { recursive: true, force: true });
for (const [order, pkg] of publishedPackages.entries()) {
  await writeGuide(pkg, order);
  await writeReference(pkg);
}
console.log(`Generated guides and API references for ${publishedPackages.length} packages.`);

async function writeGuide(pkg: PublishedPackage, order: number) {
  const readme = await readFile(join(root, pkg.directory, "README.md"), "utf8");
  const body = guideBody(readme, (target) =>
    linkTarget(target, {
      repository,
      directory: pkg.directory,
      guideFor: (file) => {
        const guide = publishedPackages.find(
          (candidate) =>
            file === candidate.directory || file === `${candidate.directory}/README.md`,
        );
        return guide && links(guide).guide;
      },
      isDirectory: (file) =>
        existsSync(join(root, file)) && statSync(join(root, file)).isDirectory(),
    }),
  );
  const page = frontmatter({
    title: pkg.name,
    description: pkg.description,
    editUrl: `${repository}/edit/main/${pkg.directory}/README.md`,
    sidebar: { label: pkg.short, order },
  });
  await mkdir(guides, { recursive: true });
  await writeFile(join(guides, `${pkg.short}.md`), `${page}\n${body}`);
}

/**
 * The package's modules, one page each, with an index of them. docgen writes into the package's
 * docs folder, where its examples resolve the package and its dependencies; the folder is removed
 * once read.
 */
async function writeReference(pkg: PublishedPackage) {
  const directory = join(root, pkg.directory);
  const output = join(directory, "docs");
  if (existsSync(output)) throw new Error(`${pkg.directory}/docs exists; docgen writes there.`);
  try {
    await runDocgen(pkg, directory);
    // Every module but the package's barrel, which only re-exports them.
    const files = (await readdir(join(output, "modules"), { recursive: true }))
      .filter((file) => file.endsWith(".ts.md") && file !== "index.ts.md")
      .toSorted();
    const folder = join(reference, pkg.short);
    await mkdir(folder, { recursive: true });
    const modules: Array<ModuleFile & { readonly summary: string }> = [];
    for (const file of files) {
      const module = moduleFile(file);
      const body = referenceBody(await readFile(join(output, "modules", file), "utf8"));
      const summary = firstSentence(body);
      const page = frontmatter({
        title: module.name,
        description: summary,
        editUrl: `${repository}/edit/main/${pkg.directory}/src/${module.source}`,
      });
      await writeFile(join(folder, `${module.slug}.md`), `${page}\n${body}\n`);
      modules.push({ ...module, summary });
    }
    await writeFile(join(folder, "index.md"), referenceIndex(pkg, modules));
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}

async function runDocgen(pkg: PublishedPackage, directory: string) {
  const docgen = Bun.spawn(
    [
      join(root, "node_modules/.bin/docgen"),
      "--srcLink",
      `${repository}/blob/main/${pkg.directory}/src/`,
      "--exclude",
      "src/**/internal/**/*.ts",
      "--examples-compiler-options",
      JSON.stringify(examplesCompilerOptions),
    ],
    {
      cwd: directory,
      // docgen typechecks examples with the `tsc` it finds on the path: the repository's.
      env: { ...process.env, PATH: `${join(root, "node_modules/.bin")}:${process.env["PATH"]}` },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(docgen.stdout).text(),
    new Response(docgen.stderr).text(),
    docgen.exited,
  ]);
  if (exitCode !== 0) throw new Error(`docgen failed for ${pkg.name}:\n${stdout}${stderr}`);
}

function referenceIndex(
  pkg: PublishedPackage,
  modules: ReadonlyArray<ModuleFile & { readonly summary: string }>,
) {
  const list = modules
    .map((module) => `- [${module.name}](./${module.slug}/): ${module.summary}`)
    .join("\n");
  return `${frontmatter({
    title: pkg.name,
    description: `The modules of ${pkg.name}, generated from their doc comments.`,
    editUrl: false,
    sidebar: { label: "Overview", order: 0 },
  })}
${pkg.description}

Each module's page lists its exports by category, with their signatures and examples. The
[guide](${links(pkg).guide}) shows how the parts fit together.

${list}
`;
}
