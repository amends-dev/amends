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

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Checked dependency boundaries for ${packages.length} shared package(s).`);
}
