/**
 * A package's distribution: what npm gets. The repository's manifests point at sources, which the
 * workspace consumes as they are. The distribution is `dist/`: the compiled JavaScript and
 * declarations, the README and the license, and a manifest of their own that points at them, with
 * `workspace:` and `catalog:` versions resolved to ranges, and without the scripts and development
 * dependencies.
 *
 *   bun run dist build packages/harness
 *   bun run dist check packages/harness
 *   bun run dist publish packages/harness [--dry-run]
 *
 * `check` builds the package and the workspace packages it depends on, then typechecks and runs a
 * consumer of the distribution, as a project that installed it from npm would, under both of
 * TypeScript's module resolutions and on Bun and Node.
 */
import { $ } from "bun";
import { cp, mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

type Exports = { readonly [key: string]: string | null | Exports };

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly private?: boolean;
  readonly description?: string;
  readonly license?: string;
  readonly homepage?: string;
  readonly repository?: unknown;
  readonly bugs?: unknown;
  readonly keywords?: unknown;
  readonly type?: string;
  readonly sideEffects?: unknown;
  readonly exports?: Exports;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly peerDependenciesMeta?: unknown;
  readonly optionalDependencies?: Record<string, string>;
  readonly engines?: unknown;
  readonly publishConfig?: unknown;
}

/** The workspace: each package's directory by its name, and the root catalog of versions. */
interface Workspace {
  readonly directories: ReadonlyMap<string, string>;
  readonly catalog: Readonly<Record<string, string>>;
}

const readManifest = (directory: string): Promise<Manifest> =>
  Bun.file(join(directory, "package.json")).json();

const readWorkspace = async (): Promise<Workspace> => {
  const manifest = await Bun.file(join(root, "package.json")).json();
  const directories = new Map<string, string>();
  for (const pattern of manifest.workspaces.packages as ReadonlyArray<string>) {
    for await (const path of new Bun.Glob(`${pattern}/package.json`).scan({ cwd: root })) {
      const directory = dirname(join(root, path));
      directories.set((await readManifest(directory)).name, directory);
    }
  }
  return { directories, catalog: manifest.workspaces.catalog };
};

/** The range the distribution depends on `name` with, for `version` as the repository writes it. */
const rangeOf = async (name: string, version: string, workspace: Workspace) => {
  const caret = (exact: string) => (/^\d/.test(exact) ? `^${exact}` : exact);
  if (version.startsWith("workspace:")) {
    const directory = workspace.directories.get(name);
    if (directory === undefined) throw new Error(`${name} is not a workspace package`);
    return caret((await readManifest(directory)).version);
  }
  if (version === "catalog:") {
    const listed = workspace.catalog[name];
    if (listed === undefined) throw new Error(`${name} is not in the root catalog`);
    return caret(listed);
  }
  return version;
};

const distPath = (path: string) => path.replace(/^\.\/src\//, "./").replace(/\.ts$/, ".js");

/** `exports` with every path into `src` pointing at the compiled file beside the manifest. */
const distExports = (exports: Exports): Exports =>
  Object.fromEntries(
    Object.entries(exports).map(([key, value]) => [
      key,
      value === null ? null : typeof value === "string" ? distPath(value) : distExports(value),
    ]),
  );

const distManifest = async (manifest: Manifest, workspace: Workspace) => {
  const ranges = async (section: Record<string, string> | undefined) =>
    section === undefined
      ? undefined
      : Object.fromEntries(
          await Promise.all(
            Object.entries(section).map(
              async ([name, version]) => [name, await rangeOf(name, version, workspace)] as const,
            ),
          ),
        );
  return {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    license: manifest.license,
    homepage: manifest.homepage,
    repository: manifest.repository,
    bugs: manifest.bugs,
    keywords: manifest.keywords,
    type: manifest.type,
    sideEffects: manifest.sideEffects,
    exports: manifest.exports === undefined ? undefined : distExports(manifest.exports),
    dependencies: await ranges(manifest.dependencies),
    peerDependencies: await ranges(manifest.peerDependencies),
    peerDependenciesMeta: manifest.peerDependenciesMeta,
    optionalDependencies: await ranges(manifest.optionalDependencies),
    engines: manifest.engines,
    publishConfig: manifest.publishConfig,
  };
};

/** Builds `directory`'s distribution into its `dist/`, returning the package's manifest. */
const build = async (directory: string, workspace: Workspace) => {
  const manifest = await readManifest(directory);
  if (manifest.private === true) throw new Error(`${manifest.name} is private`);
  const dist = join(directory, "dist");
  await rm(dist, { recursive: true, force: true });
  await $`bun run tsc -p tsconfig.build.json`.cwd(directory);
  await Bun.write(
    join(dist, "package.json"),
    `${JSON.stringify(await distManifest(manifest, workspace), null, 2)}\n`,
  );
  for (const file of ["README.md", "LICENSE"]) {
    if (!(await Bun.file(join(directory, file)).exists())) {
      throw new Error(`${manifest.name} has no ${file}`);
    }
    await cp(join(directory, file), join(dist, file));
  }
  console.log(`Built ${manifest.name}@${manifest.version} in ${dist}`);
  return manifest;
};

/**
 * Builds the package and the workspace packages it depends on, then typechecks and runs a project
 * that depends on the distribution, with the workspace packages copied in as npm would install
 * them and the other dependencies linked from the workspace.
 */
const check = async (directory: string, workspace: Workspace) => {
  const consumer = await mkdtemp(join(tmpdir(), "amends-dist-"));
  const modules = join(consumer, "node_modules");
  const installed = new Set<string>();
  /** Makes `name` resolvable in the consumer: a copy of a distribution, or a link to `target`. */
  const install = async (name: string, target: string, copy: boolean) => {
    if (installed.has(name)) return;
    installed.add(name);
    await mkdir(dirname(join(modules, name)), { recursive: true });
    await (copy
      ? cp(target, join(modules, name), { recursive: true })
      : symlink(target, join(modules, name)));
  };
  const installWithDependencies = async (packageDirectory: string) => {
    const manifest = await build(packageDirectory, workspace);
    await install(manifest.name, join(packageDirectory, "dist"), true);
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
      const workspaceDirectory = workspace.directories.get(name);
      if (workspaceDirectory !== undefined) {
        await installWithDependencies(workspaceDirectory);
      } else {
        // Bun links each workspace's own dependencies under it, or under the root.
        const target = await realpath(join(packageDirectory, "node_modules", name)).catch(() =>
          realpath(join(root, "node_modules", name)),
        );
        await install(name, target, false);
      }
    }
    return manifest;
  };
  const { name } = await installWithDependencies(directory);

  await Bun.write(
    join(consumer, "main.ts"),
    `import * as Package from "${name}";\n\nexport const exported: ReadonlyArray<string> = Object.keys(Package);\n`,
  );
  await Bun.write(
    join(consumer, "main.mjs"),
    `import * as Package from "${name}";\n\nconsole.log(Object.keys(Package).join(" "));\n`,
  );
  const tsc = join(root, "node_modules/.bin/tsc");
  for (const [module, moduleResolution] of [
    ["ESNext", "bundler"],
    ["NodeNext", "nodenext"],
  ]) {
    const compilerOptions = {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: "ESNext",
      lib: ["ESNext"],
      types: [],
      module,
      moduleResolution,
    };
    await Bun.write(
      join(consumer, "tsconfig.json"),
      JSON.stringify({ compilerOptions, include: ["main.ts"] }),
    );
    await $`${tsc} -p tsconfig.json`.cwd(consumer);
    console.log(`Typechecks with moduleResolution ${moduleResolution}`);
  }
  await $`bun run main.mjs`.cwd(consumer);
  await $`node main.mjs`.cwd(consumer);
  await rm(consumer, { recursive: true, force: true });
  console.log(`Checked ${name}: a consumer typechecks and runs it on Bun and Node`);
};

/** Publishes the distribution, or, as a dry run, lists what it would publish, without a login. */
const publish = async (directory: string, workspace: Workspace, dryRun: boolean) => {
  const manifest = await build(directory, workspace);
  const dist = join(directory, "dist");
  if (dryRun) {
    await $`bun pm pack --dry-run`.cwd(dist);
    console.log(`Would publish ${manifest.name}@${manifest.version} from ${dist}`);
    return;
  }
  await $`bun publish`.cwd(dist);
  console.log(`Published ${manifest.name}@${manifest.version}`);
};

const [command, packagePath, ...flags] = process.argv.slice(2);
if (command === undefined || packagePath === undefined) {
  console.error("Usage: bun run dist <build|check|publish> <package directory> [--dry-run]");
  process.exit(1);
}
const directory = resolve(root, packagePath);
const workspace = await readWorkspace();
switch (command) {
  case "build":
    await build(directory, workspace);
    break;
  case "check":
    await check(directory, workspace);
    break;
  case "publish":
    await publish(directory, workspace, flags.includes("--dry-run"));
    break;
  default:
    console.error(`Unknown command ${command}; use build, check, or publish`);
    process.exit(1);
}
