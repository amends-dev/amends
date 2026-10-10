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
      if (name === "effect" || name === "@effect/vitest") {
        if (version !== "catalog:") {
          errors.push(`${path}: ${section}.${name} must use the root catalog (catalog:).`);
        }
      } else if (sharedNames.has(name)) {
        if (!version.startsWith("workspace:")) {
          errors.push(`${path}: ${section}.${name} must use the workspace: protocol.`);
        }
      } else {
        errors.push(
          `${path}: ${section}.${name} is not Effect, @effect/vitest, or a shared workspace package.`,
        );
      }
    }
  }
}

// UI stays presentational and client stays headless, whatever either declares.
for await (const path of new Bun.Glob("apps/*/package.json").scan({ cwd: root })) {
  const manifest: PackageManifest = await Bun.file(`${root}/${path}`).json();
  for (const section of sections) {
    for (const name of Object.keys(manifest[section] ?? {})) {
      if (
        path === "apps/ui/package.json" &&
        ((name.startsWith("@amends-dev/") && name !== "@amends-dev/icons") ||
          name === "effect" ||
          name.startsWith("@effect/atom-") ||
          name === "@solidjs/router" ||
          name.startsWith("@tauri-apps/"))
      )
        errors.push(
          `${path}: UI must remain presentation-only; ${section}.${name} belongs in client or a platform app.`,
        );
      // Client names what it returns by the screens' types, so it takes UI to type-check only.
      const screenTypes = name === "@amends-dev/ui" && section === "devDependencies";
      if (
        path === "apps/client/package.json" &&
        ((name.startsWith("@amends-dev/") &&
          !["@amends-dev/api-http", "@amends-dev/gateway"].includes(name) &&
          !screenTypes) ||
          name.startsWith("@tauri-apps/") ||
          name === "@solidjs/router" ||
          name.startsWith("@vanilla-extract/") ||
          name === "storybook" ||
          name.startsWith("@storybook/") ||
          name.startsWith("storybook-"))
      )
        errors.push(
          `${path}: client must remain headless and take UI only as a development dependency for its types, independent of routing presentation and platform/backend implementations (${section}.${name}).`,
        );
    }
  }
}

// Platform apps compose shared UI without defining styles of their own.
for await (const path of new Bun.Glob(
  "apps/{web,desktop}/src/**/*.{css,scss,sass,less,css.ts,style.ts,styles.ts}",
).scan({ cwd: root })) {
  errors.push(
    `${path}: styles belong in UI; evaluate and verify a shared component before composing it in an app.`,
  );
}

// UI owns presentation; client's API modules own its contract imports.
for await (const path of new Bun.Glob(
  "apps/{icons,ui,client,web,desktop}/{src,test,.storybook}/**/*.{ts,tsx}",
).scan({
  cwd: root,
})) {
  const source = await Bun.file(`${root}/${path}`).text();
  if (/^apps\/(web|desktop)\/src\//.test(path) && /\bstyle\s*=|\bCSSProperties\b/.test(source)) {
    errors.push(
      `${path}: app-local style props/objects belong in UI; use reviewed component options.`,
    );
  }
  const imports = new Bun.Transpiler({ loader: path.endsWith(".tsx") ? "tsx" : "ts" }).scanImports(
    source,
  );
  // Bun's runtime scanner omits type-only imports/re-exports. They obey the same boundary.
  const declarations = source.matchAll(
    /\b(?:import|export)\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?|[\w$]+)\s+from\s*["']([^"']+)["']/g,
  );
  // Bun's JSX scanner includes synthetic React require calls, even with JSX auto-import
  // disabled. Exclude those, then recover literal require calls from the actual source.
  const runtime = new Set(imports.map((dependency) => dependency.path));
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
    const iconImport =
      dependency === "@amends-dev/icons" || dependency.startsWith("@amends-dev/icons/");
    if (
      path.startsWith("apps/icons/src/") &&
      !(
        dependency === "solid-js" ||
        dependency.startsWith("solid-js/") ||
        (dependency.startsWith(".") && target.startsWith(resolve(root, "apps/icons/src") + "/"))
      )
    )
      errors.push(
        `${path}: icon runtime must depend only on Solid and its own source (${dependency}).`,
      );
    const uiImport = dependency === "@amends-dev/ui" || dependency.startsWith("@amends-dev/ui/");
    const clientImport =
      dependency === "@amends-dev/client" || dependency.startsWith("@amends-dev/client/");
    // Shared API plumbing and each feature's api.ts reach the HTTP contract.
    // Client may name the screens' types, never import UI code.
    const screenTypeImport = uiImport && !runtime.has(dependency);
    const contractImport =
      (path.startsWith("apps/client/src/api/") ||
        /^apps\/client\/src\/[^/]+\/api\.ts$/.test(path)) &&
      [
        "@amends-dev/api-http",
        "@amends-dev/gateway/sign-in",
        "@amends-dev/gateway/directory",
      ].includes(dependency);
    if (
      path.startsWith("apps/ui/") &&
      ((dependency.startsWith("@amends-dev/") && !uiImport && !iconImport) ||
        dependency === "effect" ||
        dependency.startsWith("effect/") ||
        dependency.startsWith("@effect/atom-") ||
        dependency === "@solidjs/router" ||
        dependency.startsWith("@solidjs/router/") ||
        dependency.startsWith("@tauri-apps/") ||
        (target.startsWith(resolve(root, "apps") + "/") &&
          !target.startsWith(resolve(root, "apps/ui") + "/")) ||
        target.startsWith(resolve(root, "packages") + "/") ||
        target.startsWith(resolve(root, "adapters") + "/") ||
        target.startsWith(resolve(root, "hosts") + "/"))
    )
      errors.push(
        `${path}: UI must remain presentation-only and must not import client, API, or platform code (${dependency}).`,
      );
    if (
      path.startsWith("apps/client/") &&
      ((dependency.startsWith("@amends-dev/") &&
        !clientImport &&
        !contractImport &&
        !screenTypeImport) ||
        dependency.startsWith("@tauri-apps/") ||
        dependency === "@solidjs/router" ||
        dependency.startsWith("@solidjs/router/") ||
        dependency.startsWith("@vanilla-extract/") ||
        dependency.endsWith(".css") ||
        dependency.endsWith(".css.ts") ||
        dependency === "storybook" ||
        dependency.startsWith("storybook/") ||
        dependency.startsWith("@storybook/") ||
        dependency.startsWith("storybook-") ||
        (target.startsWith(resolve(root, "apps") + "/") &&
          !target.startsWith(resolve(root, "apps/client") + "/")) ||
        target.startsWith(resolve(root, "packages") + "/") ||
        target.startsWith(resolve(root, "adapters") + "/") ||
        target.startsWith(resolve(root, "hosts") + "/"))
    )
      errors.push(
        `${path}: client must remain headless; it may import UI types only, and styles, route rendering, and platform/backend implementations belong outside client (${dependency}).`,
      );
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${packages.length} shared packages and icons/ui/client/web/desktop import boundaries.`,
  );
}
