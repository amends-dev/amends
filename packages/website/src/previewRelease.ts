import { Array, Schema } from 'effect'

export const PreviewRelease = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  channel: Schema.Literal('canary'),
  sourceCommit: Schema.NonEmptyString,
  uploadTag: Schema.NonEmptyString,
  packages: Schema.Record(Schema.String, Schema.NonEmptyString),
})
export type PreviewRelease = typeof PreviewRelease.Type

export const decodePreviewRelease = (encoded: string): PreviewRelease =>
  Schema.decodeUnknownSync(PreviewRelease)(JSON.parse(encoded))

export const scaffoldCommand = (release: PreviewRelease): string => {
  const version = release.packages['create-foldkit-app']

  if (version === undefined) {
    throw new Error('Preview release has no create-foldkit-app package')
  }

  return `npx create-foldkit-app@${version}`
}

export const installCommand = (release: PreviewRelease): string => {
  const specs = Object.entries(release.packages)
    .filter(([name]) => name !== 'create-foldkit-app')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, version]) => `"${name}@${version}"`)

  if (Array.isArrayEmpty(specs)) {
    throw new Error('Preview release has no installable packages')
  }

  return `pnpm add --save-exact ${specs.join(' ')}`
}
