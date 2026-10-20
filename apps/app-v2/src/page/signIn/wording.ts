/**
 * What signing in says when a code was not requested, was not accepted, or was sent again, in the words of
 * `@amends-dev/ui`, and where it says it: at the field, which it outlines, when the entry itself is wrong, and over the
 * button, about the request, when the entry is not.
 */

import * as Option from "effect/Option"
import type { CodeError, EmailError } from "./definition.ts"

/** What goes wrong, as the person is told it: at the field, or over the button, one of the two. */
export type Problem = Readonly<{ atField: Option.Option<string>; aboveButton: Option.Option<string> }>

/** Nothing has gone wrong. */
export const noProblem: Problem = { atField: Option.none(), aboveButton: Option.none() }

const atField = (words: string): Problem => ({ atField: Option.some(words), aboveButton: Option.none() })

const aboveButton = (words: string): Problem => ({ atField: Option.none(), aboveButton: Option.some(words) })

const emailProblems: Readonly<Record<EmailError, Problem>> = {
  InvalidEmail: atField("Enter a valid email address."),
  RateLimited: aboveButton("Too many codes were requested lately. Try again later."),
  RequestFailed: aboveButton("We couldn't request a code. Try again.")
}

const codeProblems: Readonly<Record<CodeError, Problem>> = {
  InvalidCode: atField("Enter all six digits."),
  Mismatch: atField("That code doesn't match. Check it and try again."),
  Expired: atField("This code has expired. Request a new one."),
  Unknown: atField("This code is no longer available. Request a new one."),
  VerifyFailed: aboveButton("We couldn't verify your code. Try again."),
  ResendLimited: aboveButton("Too many codes were requested lately. Use the last one, or try later."),
  ResendFailed: aboveButton("We couldn't request a new code. Try again.")
}

/** What the person is told of why a code was not requested, if it was not. */
export const emailProblem = (error: Option.Option<EmailError>): Problem =>
  Option.match(error, { onNone: () => noProblem, onSome: (known) => emailProblems[known] })

/** What the person is told of why a code was not accepted or sent again, if it was not. */
export const codeProblem = (error: Option.Option<CodeError>): Problem =>
  Option.match(error, { onNone: () => noProblem, onSome: (known) => codeProblems[known] })

/** What the code step says once a new code was sent. */
export const resentNotice = "We sent a new code. Use the latest one."
