import { dirname, resolve } from "node:path"

interface PackageManifest {
  name: string
  version: string
  private?: boolean
  publishConfig?: { directory?: string }
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

const root = `${import.meta.dir}/..`
const packages: Array<{ path: string; manifest: PackageManifest }> = []

for await (const path of new Bun.Glob("packages/*/package.json").scan({ cwd: root })) {
  const manifest: PackageManifest = await Bun.file(`${root}/${path}`).json()
  packages.push({ path, manifest })
}

const sharedNames = new Set(packages.map(({ manifest }) => manifest.name))
const sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const
const errors: Array<string> = []

for (const { path, manifest } of packages) {
  for (const section of sections) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (name === "effect" || name === "@effect/vitest") {
        if (version !== "catalog:") {
          errors.push(`${path}: ${section}.${name} must use the root catalog (catalog:).`)
        }
      } else if (sharedNames.has(name)) {
        if (!version.startsWith("workspace:")) {
          errors.push(`${path}: ${section}.${name} must use the workspace: protocol.`)
        }
      } else {
        errors.push(`${path}: ${section}.${name} is not Effect, @effect/vitest, or a shared workspace package.`)
      }
    }
  }
}

// Published packages release in lines: they share a version's major and minor, so each works with
// every other on its line, and a fix releases its own package alone. They depend on each other with
// `workspace:^`, which publishes as a caret range that later fixes on the line satisfy, and
// Changesets publishes their distribution, which `bun run dist build` writes to `dist`.
const published: Array<{ path: string; manifest: PackageManifest }> = []
for (const pattern of ["packages/*/package.json", "adapters/*/package.json"]) {
  for await (const path of new Bun.Glob(pattern).scan({ cwd: root })) {
    const manifest: PackageManifest = await Bun.file(`${root}/${path}`).json()
    if (manifest.private !== true) published.push({ path, manifest })
  }
}
const publishedNames = new Set(published.map(({ manifest }) => manifest.name))
const lineOf = (version: string) => version.split(".").slice(0, 2).join(".")
if (new Set(published.map(({ manifest }) => lineOf(manifest.version))).size > 1) {
  errors.push(
    `Published packages must share one line, a major and minor version: ${published
      .map(({ manifest }) => `${manifest.name} is ${manifest.version}`)
      .join(", ")}.`
  )
}
for (const { path, manifest } of published) {
  if (manifest.publishConfig?.directory !== "dist") {
    errors.push(`${path}: publishConfig.directory must be "dist", the distribution Changesets publishes.`)
  }
  for (const section of ["dependencies", "peerDependencies", "optionalDependencies"] as const) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (publishedNames.has(name) && version !== "workspace:^") {
        errors.push(`${path}: ${section}.${name} must be workspace:^, which publishes as a caret range.`)
      }
    }
  }
}

// UI stays presentational, whatever it declares.
for await (const path of new Bun.Glob("apps/*/package.json").scan({ cwd: root })) {
  const manifest: PackageManifest = await Bun.file(`${root}/${path}`).json()
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
        errors.push(`${path}: UI must remain presentation-only; ${section}.${name} belongs in an app.`)
    }
  }
}

// The site composes shared UI without defining styles of its own.
for await (const path of new Bun.Glob("apps/site/src/**/*.{css,scss,sass,less,css.ts,style.ts,styles.ts}").scan({
  cwd: root
})) {
  errors.push(`${path}: styles belong in UI; evaluate and verify a shared component before composing it in an app.`)
}

// Nor do its pages carry style elements, style props, or style objects.
for await (const path of new Bun.Glob("apps/site/src/**/*.{astro,ts,tsx}").scan({
  cwd: root
})) {
  const source = await Bun.file(`${root}/${path}`).text()
  if (/<style\b|\bstyle\s*=|\bCSSProperties\b/.test(source)) {
    errors.push(`${path}: app-local styles belong in UI; use reviewed component options.`)
  }
}

// UI owns presentation, icons are drawings alone, and app data is independent of feature Blocks and views.
for await (const path of new Bun.Glob("apps/{icons,ui,app-v2}/{src,test,.storybook}/**/*.{ts,tsx}").scan({
  cwd: root
})) {
  const source = await Bun.file(`${root}/${path}`).text()
  const imports = new Bun.Transpiler({ loader: path.endsWith(".tsx") ? "tsx" : "ts" }).scanImports(source)
  // Bun's runtime scanner omits type-only imports/re-exports. They obey the same boundary.
  const declarations = source.matchAll(
    /\b(?:import|export)\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?|[\w$]+)\s+from\s*["']([^"']+)["']/g
  )
  // Bun's JSX scanner includes synthetic React require calls, even with JSX auto-import
  // disabled. Exclude those, then recover literal require calls from the actual source.
  const dependencies = new Set(
    imports
      .filter(
        (dependency) =>
          dependency.kind !== "require-call" || !["react", "react/jsx-dev-runtime"].includes(dependency.path)
      )
      .map((dependency) => dependency.path)
  )
  for (const required of source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (required[1]) dependencies.add(required[1])
  }
  for (const declaration of declarations) {
    if (declaration[1]) dependencies.add(declaration[1])
  }
  for (const dependency of dependencies) {
    const target = dependency.startsWith(".") ? resolve(root, dirname(path), dependency) : dependency
    if (path.startsWith("apps/app-v2/src/data/") && !path.endsWith(".test.ts")) {
      const packageName = dependency.split("/").slice(0, 2).join("/")
      const isDataModule = dependency.startsWith(".") && target.startsWith(resolve(root, "apps/app-v2/src/data") + "/")
      if (
        !(isDataModule || dependency === "effect" || dependency.startsWith("effect/") || sharedNames.has(packageName))
      )
        errors.push(
          `${path}: app data must depend only on shared packages, Effect, and other data modules (${dependency}).`
        )
    }
    const iconImport = dependency === "@amends-dev/icons" || dependency.startsWith("@amends-dev/icons/")
    if (
      path.startsWith("apps/icons/src/") &&
      !(
        dependency === "solid-js" ||
        dependency.startsWith("solid-js/") ||
        (dependency.startsWith(".") && target.startsWith(resolve(root, "apps/icons/src") + "/"))
      )
    )
      errors.push(`${path}: icon runtime must depend only on Solid and its own source (${dependency}).`)
    const uiImport = dependency === "@amends-dev/ui" || dependency.startsWith("@amends-dev/ui/")
    if (
      path.startsWith("apps/ui/") &&
      ((dependency.startsWith("@amends-dev/") && !uiImport && !iconImport) ||
        dependency === "effect" ||
        dependency.startsWith("effect/") ||
        dependency.startsWith("@effect/atom-") ||
        dependency === "@solidjs/router" ||
        dependency.startsWith("@solidjs/router/") ||
        dependency.startsWith("@tauri-apps/") ||
        (target.startsWith(resolve(root, "apps") + "/") && !target.startsWith(resolve(root, "apps/ui") + "/")) ||
        target.startsWith(resolve(root, "packages") + "/") ||
        target.startsWith(resolve(root, "adapters") + "/") ||
        target.startsWith(resolve(root, "hosts") + "/"))
    )
      errors.push(`${path}: UI must remain presentation-only and must not import API or platform code (${dependency}).`)
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"))
  process.exitCode = 1
} else {
  console.log(
    `Checked ${packages.length} shared packages, ${published.length} published packages' lines, icons/ui/app-data import boundaries, and site styles.`
  )
}
