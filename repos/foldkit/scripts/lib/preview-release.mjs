import { Array } from 'effect'
import { readFileSync, writeFileSync } from 'node:fs'
import semver from 'semver'

import { canaryVersion } from './package-version.mjs'

const FULL_GIT_COMMIT_PATTERN = /^[0-9a-f]{40}$/

const fail = message => {
  throw new Error(message)
}

const sortedEntries = packages =>
  Object.entries(packages).sort(([left], [right]) => left.localeCompare(right))

export const previewUploadTag = commit => {
  if (!FULL_GIT_COMMIT_PATTERN.test(commit)) {
    return fail(`invalid preview source commit ${commit}`)
  }

  return `foldkit-canary-upload-${commit.slice(0, 12)}`
}

export const previewReleaseManifest = ({ commit, packages }) => ({
  schemaVersion: 1,
  channel: 'canary',
  sourceCommit: commit,
  uploadTag: previewUploadTag(commit),
  packages: Object.fromEntries(
    packages.map(pkg => [pkg.packageJson.name, pkg.packageJson.version]),
  ),
})

export const writePreviewReleaseManifest = (path, input) => {
  const manifest = previewReleaseManifest(input)

  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)

  return manifest
}

const assertManifestShape = manifest => {
  if (typeof manifest !== 'object' || manifest === null) {
    return fail('preview release manifest must be an object')
  }
  if (manifest.schemaVersion !== 1) {
    return fail('preview release manifest must use schemaVersion 1')
  }
  if (manifest.channel !== 'canary') {
    return fail('preview release manifest must describe a canary snapshot')
  }
  if (!FULL_GIT_COMMIT_PATTERN.test(manifest.sourceCommit)) {
    return fail('preview release manifest has an invalid source commit')
  }
  if (manifest.uploadTag !== previewUploadTag(manifest.sourceCommit)) {
    return fail('preview release manifest has the wrong upload tag')
  }
  if (typeof manifest.packages !== 'object' || manifest.packages === null) {
    return fail('preview release manifest must contain package versions')
  }
}

export const validatePreviewReleaseManifest = ({
  manifest,
  target,
  packages,
}) => {
  assertManifestShape(manifest)

  if (!FULL_GIT_COMMIT_PATTERN.test(target)) {
    return fail(`invalid preview target commit ${target}`)
  }
  if (manifest.sourceCommit !== target) {
    return fail(
      `preview release manifest belongs to ${manifest.sourceCommit}, not ${target}`,
    )
  }

  const expectedVersions = new Map(
    packages.map(pkg => [
      pkg.packageJson.name,
      canaryVersion(pkg.packageJson.version, target),
    ]),
  )
  const manifestEntries = sortedEntries(manifest.packages)

  if (manifestEntries.length !== expectedVersions.size) {
    return fail(
      `preview release manifest has ${String(manifestEntries.length)} packages; expected ${String(expectedVersions.size)}`,
    )
  }

  for (const [name, version] of manifestEntries) {
    const expectedVersion = expectedVersions.get(name)

    if (expectedVersion === undefined) {
      return fail(`preview release manifest contains unknown package ${name}`)
    }
    if (!semver.valid(version)) {
      return fail(
        `preview release manifest has invalid version ${name}@${String(version)}`,
      )
    }
    if (version !== expectedVersion) {
      return fail(
        `preview release manifest has ${name}@${version}; expected ${name}@${expectedVersion}`,
      )
    }
  }

  for (const name of expectedVersions.keys()) {
    if (!(name in manifest.packages)) {
      return fail(`preview release manifest is missing ${name}`)
    }
  }

  return manifest
}

export const readPreviewReleaseManifest = ({ path, target, packages }) => {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))

  return validatePreviewReleaseManifest({ manifest, target, packages })
}

export const previewScaffoldCommand = manifest => {
  const version = manifest.packages['create-foldkit-app']

  if (version === undefined) {
    return fail('preview release manifest has no create-foldkit-app package')
  }

  return `npx create-foldkit-app@${version}`
}

export const previewInstallCommand = manifest => {
  const specs = sortedEntries(manifest.packages)
    .filter(([name]) => name !== 'create-foldkit-app')
    .map(([name, version]) => `${name}@${version}`)

  if (Array.isArrayEmpty(specs)) {
    return fail('preview release manifest has no installable packages')
  }

  return `pnpm add --save-exact ${specs.map(spec => `"${spec}"`).join(' ')}`
}

export const previewReadySummary = (manifest, deploymentUrl) => {
  const url = new URL(deploymentUrl)

  if (url.protocol !== 'https:') {
    return fail('preview deployment URL must use HTTPS')
  }

  const packages = sortedEntries(manifest.packages)
    .map(
      ([name, version]) =>
        `- [\`${name}@${version}\`](https://www.npmjs.com/package/${name}/v/${version})`,
    )
    .join('\n')

  return (
    `## Integration preview ready\n\n` +
    `Source: [\`${manifest.sourceCommit}\`](https://github.com/foldkit/foldkit/commit/${manifest.sourceCommit})\n\n` +
    `Website: [${url.href}](${url.href})\n\n` +
    `Scaffold: \`${previewScaffoldCommand(manifest)}\`\n\n` +
    `Install the complete exact snapshot: \`${previewInstallCommand(manifest)}\`\n\n` +
    `${packages}\n`
  )
}
