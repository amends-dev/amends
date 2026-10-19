import { Number } from 'effect'

import {
  ApplicationDefinition,
  FieldStepsComposition,
  FieldStepsDefinition,
  TextFieldStepsDefinition,
  VariantFieldStepsDefinition,
} from './field-steps.accepted.js'

// @ts-expect-error Unknown field-only records cannot be silently ignored.
FieldStepsDefinition.stepFields(() => ({ extra: () => 1 }))
// @ts-expect-error Known fields cannot hide extra keys.
FieldStepsDefinition.stepFields(() => ({
  count: Number.increment,
  extra: () => 1,
}))
FieldStepsDefinition.stepFields(() => ({
  // @ts-expect-error Field transformations preserve their input type.
  count: (value: string) => value.length,
}))
// @ts-expect-error Field transformations preserve their output type.
FieldStepsDefinition.stepFields(() => ({ count: () => 'invalid' }))
// @ts-expect-error Application-owned helpers reject unknown fields as well.
ApplicationDefinition.stepFields(() => ({ extra: () => 1 }))
// @ts-expect-error Variant tags cannot be changed while retaining incompatible fields.
VariantFieldStepsDefinition.stepFields(() => ({ _tag: () => 'Flag' }))
// @ts-expect-error Primitive Models do not have struct field transformations.
TextFieldStepsDefinition.stepFields(() => ({}))
// @ts-expect-error The no-op factory takes no arguments.
FieldStepsDefinition.stepNoop(() => undefined)
// @ts-expect-error The no-op checks the owning Model.
FieldStepsDefinition.stepNoop()({ count: 'invalid' })
// @ts-expect-error Compositions do not duplicate Definition-owned field authoring.
FieldStepsComposition.stepFields
// @ts-expect-error Compositions do not duplicate Definition-owned no-op authoring.
FieldStepsComposition.stepNoop

const UnknownField = Symbol('UnknownField')
// @ts-expect-error Unknown symbol fields are rejected alongside known fields.
FieldStepsDefinition.stepFields(() => ({
  count: Number.increment,
  [UnknownField]: () => 1,
}))
