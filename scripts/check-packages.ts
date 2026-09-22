import { dirname, resolve } from "node:path";

interface PackageManifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const root = `${import.meta.dir}/..`;
const packages: Array<{ path: string; manifest: PackageManifest }> = [];

for await (const path of new Bun.Glob("packages/*/package.json").scan({ cwd: root })) {
  const manifest: PackageManifest = await Bun.file(`${root}/${path}`).json();
  packages.push({ path, manifest });
}

const sharedNames = new Set(packages.map(({ manifest }) => manifest.name));
const sections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;
const errors: string[] = [];

for (const { path, manifest } of packages) {
  for (const section of sections) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (name === "effect") {
        if (version !== "catalog:") {
          errors.push(`${path}: ${section}.effect must use the root catalog (catalog:).`);
        }
      } else if (sharedNames.has(name)) {
        if (!version.startsWith("workspace:")) {
          errors.push(`${path}: ${section}.${name} must use the workspace: protocol.`);
        }
      } else {
        errors.push(`${path}: ${section}.${name} is not Effect or a shared workspace package.`);
      }
    }
  }
}

// Retired presentation packages must not return as application dependencies.
for await (const path of new Bun.Glob("apps/*/package.json").scan({ cwd: root })) {
  const manifest: PackageManifest = await Bun.file(`${root}/${path}`).json();
  for (const section of sections) {
    for (const name of Object.keys(manifest[section] ?? {})) {
      if (name === "@amends/ui" || name === "@amends/design-system") {
        errors.push(`${path}: ${section}.${name} is retired; use @amends/frontend.`);
      }
    }
  }
}

// Shared presentation stays independent of application and backend entry points.
for await (const path of new Bun.Glob("apps/{icons,frontend,web,desktop}/src/**/*.{ts,tsx}").scan({
  cwd: root,
})) {
  const source = await Bun.file(`${root}/${path}`).text();
  const imports = new Bun.Transpiler({ loader: path.endsWith(".tsx") ? "tsx" : "ts" }).scanImports(
    source,
  );
  // Bun's runtime scanner omits type-only imports/re-exports. They obey the same boundary.
  const declarations = source.matchAll(
    /\b(?:import|export)\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?|[\w$]+)\s+from\s*["']([^"']+)["']/g,
  );
  // Bun's JSX scanner includes synthetic React require calls, even with JSX auto-import
  // disabled. Exclude those, then recover literal require calls from the actual source.
  const dependencies = new Set(
    imports
      .filter(
        (dependency) =>
          dependency.kind !== "require-call" ||
          !["react", "react/jsx-dev-runtime"].includes(dependency.path),
      )
      .map((dependency) => dependency.path),
  );
  for (const required of source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (required[1]) dependencies.add(required[1]);
  }
  for (const declaration of declarations) {
    if (declaration[1]) dependencies.add(declaration[1]);
  }
  for (const dependency of dependencies) {
    const target = dependency.startsWith(".")
      ? resolve(root, dirname(path), dependency)
      : dependency;
    const iconImport = dependency === "@amends/icons" || dependency.startsWith("@amends/icons/");
    if (
      path.startsWith("apps/icons/") &&
      !(
        dependency === "solid-js" ||
        dependency.startsWith("solid-js/") ||
        (dependency.startsWith(".") && target.startsWith(resolve(root, "apps/icons/src") + "/"))
      )
    )
      errors.push(
        `${path}: icon runtime must depend only on Solid and its own source (${dependency}).`,
      );
    if (
      dependency === "@amends/ui" ||
      dependency.startsWith("@amends/ui/") ||
      dependency === "@amends/design-system" ||
      dependency.startsWith("@amends/design-system/")
    )
      errors.push(`${path}: ${dependency} is retired; use @amends/frontend.`);
    if (
      path.startsWith("apps/frontend/") &&
      ((dependency.startsWith("@amends/") &&
        !dependency.startsWith("@amends/frontend/") &&
        !iconImport) ||
        (target.startsWith(resolve(root, "apps") + "/") &&
          !target.startsWith(resolve(root, "apps/frontend") + "/")) ||
        dependency.startsWith("@tauri-apps/") ||
        target.startsWith(resolve(root, "packages") + "/") ||
        target.startsWith(resolve(root, "adapters") + "/") ||
        target.startsWith(resolve(root, "hosts") + "/"))
    )
      errors.push(
        `${path}: frontend must remain independent of platform and backend code (${dependency}).`,
      );
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${packages.length} shared packages and icons/frontend/web/desktop import boundaries.`,
  );
}
