import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { injectBridgeScript } from '../build-examples.ts'
import {
  previewInstallCommand,
  previewReadySummary,
  previewReleaseManifest,
  previewScaffoldCommand,
  validatePreviewReleaseManifest,
} from './preview-release.mjs'

const COMMIT = '0123456789abcdef0123456789abcdef01234567'

const packages = [
  {
    packageJson: { name: 'foldkit', version: '1.2.3' },
  },
  {
    packageJson: { name: '@foldkit/ui', version: '2.3.4' },
  },
  {
    packageJson: { name: 'create-foldkit-app', version: '3.4.5' },
  },
]

const manifest = previewReleaseManifest({
  commit: COMMIT,
  packages: packages.map(pkg => ({
    packageJson: {
      ...pkg.packageJson,
      version: `${pkg.packageJson.version}-canary.${COMMIT.slice(0, 12)}`,
    },
  })),
})

test('validates the complete commit-addressed preview snapshot', () => {
  assert.deepEqual(
    validatePreviewReleaseManifest({ manifest, target: COMMIT, packages }),
    manifest,
  )
  assert.equal(manifest.uploadTag, 'foldkit-canary-upload-0123456789ab')
})

test('rejects a preview manifest from another commit', () => {
  assert.throws(
    () =>
      validatePreviewReleaseManifest({
        manifest,
        target: '1123456789abcdef0123456789abcdef01234567',
        packages,
      }),
    /belongs to .* not/,
  )
})

test('rejects missing, extra, and mismatched package versions', () => {
  const cases = [
    {
      ...manifest,
      packages: { ...manifest.packages, foldkit: '1.2.4-canary.0123456789ab' },
    },
    {
      ...manifest,
      packages: Object.fromEntries(
        Object.entries(manifest.packages).filter(
          ([name]) => name !== 'foldkit',
        ),
      ),
    },
    {
      ...manifest,
      packages: { ...manifest.packages, unexpected: '1.0.0' },
    },
  ]

  for (const candidate of cases) {
    assert.throws(() =>
      validatePreviewReleaseManifest({
        manifest: candidate,
        target: COMMIT,
        packages,
      }),
    )
  }
})

test('reports exact scaffold and install commands from verified versions', () => {
  assert.equal(
    previewScaffoldCommand(manifest),
    'npx create-foldkit-app@3.4.5-canary.0123456789ab',
  )
  assert.equal(
    previewInstallCommand(manifest),
    'pnpm add --save-exact "@foldkit/ui@2.3.4-canary.0123456789ab" "foldkit@1.2.3-canary.0123456789ab"',
  )

  const summary = previewReadySummary(manifest, 'https://example.vercel.app')

  assert.match(summary, /Integration preview ready/)
  assert.match(summary, new RegExp(COMMIT))
  assert.match(summary, /https:\/\/example\.vercel\.app\//)
  assert.match(summary, /create-foldkit-app@3\.4\.5-canary\.0123456789ab/)
  assert.match(summary, /@foldkit\/ui@2\.3\.4-canary\.0123456789ab/)
})

test('marks embedded examples with the exact website build', context => {
  const directory = mkdtempSync(resolve(tmpdir(), 'foldkit-example-build-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const nestedDirectory = resolve(directory, 'nested')
  const indexPath = resolve(nestedDirectory, 'index.html')
  const buildId = `${COMMIT}/preview?attempt=2`

  mkdirSync(nestedDirectory)
  writeFileSync(indexPath, '<html><head></head><body></body></html>')
  injectBridgeScript(directory, buildId)

  assert.ok(
    readFileSync(indexPath, 'utf8').includes(
      `bridge.js?build=${encodeURIComponent(buildId)}`,
    ),
  )
})
