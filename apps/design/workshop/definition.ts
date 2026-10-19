/**
 * What the workshop remembers: the text of its fields and boxes, which switches are on, the plan chosen,
 * and how often a button was pressed.
 */

import * as Schema from "effect/Schema"
import { makeApplicationDefinition } from "foldkit"
import { defineMessageUnion } from "foldkit/message"

export const Plan = Schema.Literals(["free", "team", "enterprise"])
export type Plan = typeof Plan.Type

export const Model = Schema.Struct({
  workspaceName: Schema.String,
  fullName: Schema.String,
  email: Schema.String,
  signInEmail: Schema.String,
  code: Schema.String,
  notes: Schema.String,
  isNotificationsOn: Schema.Boolean,
  isDigestOn: Schema.Boolean,
  plan: Plan,
  pressCount: Schema.Finite
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ClickedButton: {},
  TypedWorkspaceName: { value: Schema.String },
  TypedFullName: { value: Schema.String },
  TypedEmail: { value: Schema.String },
  TypedSignInEmail: { value: Schema.String },
  TypedCode: { value: Schema.String },
  TypedNotes: { value: Schema.String },
  ToggledNotifications: { isOn: Schema.Boolean },
  ToggledDigest: { isOn: Schema.Boolean },
  ChangedPlan: { plan: Plan }
})
export type Message = typeof Message.Type

export const ApplicationDefinition = makeApplicationDefinition({ Model, Message })
