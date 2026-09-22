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

// Keep endpoint construction in web/api and presentation independent of application contracts.
for await (const path of new Bun.Glob("apps/{icons,ui,design-system,web}/src/**/*.{ts,tsx}").scan({
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
      path.startsWith("apps/ui/") &&
      ((dependency.startsWith("@amends/") && !iconImport) ||
        (target.startsWith(resolve(root, "apps") + "/") &&
          !target.startsWith(resolve(root, "apps/ui") + "/")) ||
        target.startsWith(resolve(root, "packages") + "/") ||
        target.startsWith(resolve(root, "adapters") + "/") ||
        target.startsWith(resolve(root, "hosts") + "/"))
    )
      errors.push(`${path}: UI must not import application code or contracts (${dependency}).`);
    if (
      path.startsWith("apps/design-system/") &&
      ((dependency.startsWith("@amends/") &&
        !dependency.startsWith("@amends/ui/") &&
        !iconImport) ||
        dependency === "storybook" ||
        dependency.startsWith("storybook/") ||
        dependency.startsWith("storybook-") ||
        dependency.startsWith("@storybook/") ||
        target.startsWith(resolve(root, "apps/web") + "/") ||
        target.startsWith(resolve(root, "apps/design-system/stories") + "/") ||
        target.startsWith(resolve(root, "apps/design-system/.storybook") + "/") ||
        target.startsWith(resolve(root, "packages") + "/") ||
        target.startsWith(resolve(root, "adapters") + "/") ||
        target.startsWith(resolve(root, "hosts") + "/"))
    )
      errors.push(
        `${path}: feature UI must remain independent of application services and Storybook (${dependency}).`,
      );
    if (
      path.startsWith("apps/web/") &&
      !path.startsWith("apps/web/src/api/") &&
      (target === resolve(root, "apps/web/src/api/client.ts") ||
        dependency === "@amends/api-http" ||
        dependency.startsWith("@amends/api-http/"))
    )
      errors.push(`${path}: use a named web API module instead of ${dependency}.`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${packages.length} shared packages and icons/web/design-system/UI import boundaries.`,
  );
}
