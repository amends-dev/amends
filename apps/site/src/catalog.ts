/**
 * The packages amends publishes to npm, read from the repository's manifests: what the packages
 * page lists, what the documentation has a guide and an API reference for, and what the
 * documentation's generator builds them from. A manifest that is not private and publishes
 * publicly is a published package; the README of its directory is its guide.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The repository's root: the nearest directory up from where the site's commands run whose
 * manifest declares the workspaces. Found from the working directory, as Astro bundles this file
 * away from where it lives.
 */
export const root = findRoot(process.cwd());

function findRoot(from: string): string {
  const manifest = join(from, "package.json");
  if (existsSync(manifest) && "workspaces" in JSON.parse(readFileSync(manifest, "utf8"))) {
    return from;
  }
  const parent = dirname(from);
  if (parent === from) throw new Error("No workspace root above the working directory.");
  return findRoot(parent);
}

export const repository = "https://github.com/amends-dev/amends";

export interface PublishedPackage {
  /** As published, such as "@amends-dev/harness". */
  readonly name: string;
  /** The name without the scope, such as "harness": its documentation's slug. */
  readonly short: string;
  /** Its directory in the repository, such as "packages/harness". */
  readonly directory: string;
  readonly version: string;
  readonly description: string;
  /** A contract lives in packages/; an adapter, in adapters/, implements one. */
  readonly kind: "contract" | "adapter";
  /** For an adapter, the contract it implements, which its name begins with, such as "harness". */
  readonly implements: string | undefined;
}

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly private?: boolean;
  readonly publishConfig?: { readonly access?: string };
}

const readPackages = (folder: "packages" | "adapters"): ReadonlyArray<PublishedPackage> =>
  readdirSync(join(root, folder), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const directory = `${folder}/${entry.name}`;
      let manifest: Manifest;
      try {
        manifest = JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8"));
      } catch {
        return [];
      }
      if (manifest.private === true || manifest.publishConfig?.access !== "public") return [];
      const short = manifest.name.replace(/^@amends-dev\//, "");
      return [
        {
          name: manifest.name,
          short,
          directory,
          version: manifest.version,
          description: manifest.description ?? "",
          kind: folder === "packages" ? "contract" : "adapter",
          implements: folder === "adapters" ? short.split("-")[0] : undefined,
        } satisfies PublishedPackage,
      ];
    });

const adapterCount = (contract: PublishedPackage, all: ReadonlyArray<PublishedPackage>) =>
  all.filter((candidate) => candidate.implements === contract.short).length;

/**
 * Contracts first, those with the most adapters leading, then adapters grouped by the contract
 * they implement, in the contracts' order.
 */
const orderPackages = (all: ReadonlyArray<PublishedPackage>): ReadonlyArray<PublishedPackage> => {
  const contracts = all
    .filter((pkg) => pkg.kind === "contract")
    .toSorted(
      (a, b) => adapterCount(b, all) - adapterCount(a, all) || a.short.localeCompare(b.short),
    );
  const place = (pkg: PublishedPackage) =>
    contracts.findIndex((contract) => contract.short === pkg.implements);
  const adapters = all
    .filter((pkg) => pkg.kind === "adapter")
    .toSorted((a, b) => place(a) - place(b) || a.short.localeCompare(b.short));
  return [...contracts, ...adapters];
};

export const publishedPackages: ReadonlyArray<PublishedPackage> = orderPackages([
  ...readPackages("packages"),
  ...readPackages("adapters"),
]);

export const contracts = publishedPackages.filter((pkg) => pkg.kind === "contract");
export const adapters = publishedPackages.filter((pkg) => pkg.kind === "adapter");

/** The adapters that implement `contract`. */
export const adaptersOf = (contract: PublishedPackage) =>
  adapters.filter((adapter) => adapter.implements === contract.short);

/** Where a package's guide, API reference, npm page, and source are. */
export const links = (pkg: PublishedPackage) => ({
  guide: `/docs/packages/${pkg.short}/`,
  reference: `/docs/api/${pkg.short}/`,
  npm: `https://www.npmjs.com/package/${pkg.name}`,
  source: `${repository}/tree/main/${pkg.directory}`,
});
