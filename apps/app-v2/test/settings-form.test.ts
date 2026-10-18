import { Integration } from "@amends-dev/connection"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Result, Schema } from "effect"
import * as SettingsForm from "../src/settingsForm.ts"

/** The form of an integration with each kind of setting, as the host lists it. */
const form = Integration.make({
  id: "test-api",
  name: "Test API",
  settings: Schema.Struct({
    url: Schema.NonEmptyString.annotate({ title: "Base URL", description: "Where the API is." }),
    retries: Schema.optionalKey(Schema.Int.annotate({ title: "Retries" })),
    verbose: Schema.optionalKey(Schema.Boolean.annotate({ title: "Verbose" })),
    region: Schema.optionalKey(Schema.Literals(["eu", "us"]).annotate({ title: "Region" }))
  }),
  auth: ["apiKey", "none"],
  check: () => Effect.succeed({ status: "healthy" })
}).settings

describe("SettingsForm", () => {
  it("reads each field of an integration's form, with its title, whether it is required, and what it takes", () => {
    expect(
      SettingsForm.fieldsOf(form).map(({ name, title, required, input }) => ({
        name,
        title,
        required,
        kind: input._tag
      }))
    ).toEqual([
      { name: "url", title: "Base URL", required: true, kind: "Text" },
      { name: "retries", title: "Retries", required: false, kind: "Number" },
      { name: "verbose", title: "Verbose", required: false, kind: "Toggle" },
      { name: "region", title: "Region", required: false, kind: "Choice" }
    ])
  })

  it("starts a draft from a connection's settings, or each field's default", () => {
    expect(SettingsForm.draftOf(form)).toEqual({ url: "", retries: "", verbose: false, region: "eu" })
    expect(SettingsForm.draftOf(form, { url: "https://api.example", retries: 3, verbose: true, region: "us" })).toEqual(
      { url: "https://api.example", retries: "3", verbose: true, region: "us" }
    )
  })

  it("makes settings of a draft, leaving out optional fields left empty, or says which field it wants", () => {
    expect(
      SettingsForm.settingsOf(form, { url: " https://api.example ", retries: "", verbose: false, region: "us" })
    ).toEqual(Result.succeed({ url: "https://api.example", verbose: false, region: "us" }))
    expect(SettingsForm.settingsOf(form, { url: "https://api.example", retries: "2", verbose: true })).toEqual(
      Result.succeed({ url: "https://api.example", retries: 2, verbose: true })
    )
    expect(SettingsForm.settingsOf(form, { url: "  " })).toEqual(Result.fail("Base URL is required."))
    expect(SettingsForm.settingsOf(form, { url: "https://api.example", retries: "2.5" })).toEqual(
      Result.fail("Retries needs a whole number.")
    )
  })
})
