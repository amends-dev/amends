/** Agent labels, marks, and animation choices shared by views. */

import { Agent } from "@amends-dev/core/agent"
import type { LogoMotion } from "@amends-dev/design/logo"
import type { MarkStatus } from "@amends-dev/design/mark"
import * as Option from "effect/Option"
import type { ActivityState, AgentActivity, AgentItem, TurnUnderWay } from "../data/agents.ts"

/** A state in a word, such as "Working". */
export const stateWord: Readonly<Record<ActivityState, string>> = {
  queued: "Queued",
  working: "Working",
  stopping: "Stopping"
}

/** A state in a word within a line, such as "working": "Yumi working". */
export const workingLabel = (name: string, state: ActivityState): string => `${name} ${stateWord[state].toLowerCase()}`

/**
 * How the logo moves for a state: the thread drawn through while it waits, the stitches lit at work, the patch tugged.
 */
export const motionOfState: Readonly<Record<ActivityState, LogoMotion>> = {
  queued: "thread",
  working: "working",
  stopping: "tug"
}

/** Where an agent is at work, as a line: "#general", or "#general + 1 more". */
export const placesLine = (places: ReadonlyArray<string>): string =>
  places.length > 1 ? `${places[0]} + ${places.length - 1} more` : (places[0] ?? "")

/**
 * What an agent is doing in words, as its mark says it: "Working in #general", or only "Working" while no place is
 * read.
 */
export const activityLabel = ({ state, places }: AgentActivity): string =>
  places.length === 0 ? stateWord[state] : `${stateWord[state]} in ${placesLine(places)}`

/** What a turn under way is doing in words, as the agent's page lists it: "Queued in #design". */
export const turnLabel = ({ state, place }: Pick<TurnUnderWay, "state" | "place">): string =>
  Option.match(place, { onNone: () => stateWord[state], onSome: (place) => `${stateWord[state]} in ${place}` })

/** Why an agent can't run, as a sentence. */
export const issueSentence = (issue: Agent.Issue): string =>
  Agent.Issue.match(issue, {
    Removed: ({ part }) => `Its ${part} connection was removed.`,
    Uninstalled: ({ part }) => `Its ${part} connection’s integration isn’t installed on this host.`,
    Invalid: ({ description }) => (description.endsWith(".") ? description : `${description}.`),
    SandboxRequired: () => "Its harness works only in a sandbox, and it has none.",
    NoHarness: () => "No connection gives a harness it can run on."
  })

/**
 * How an agent stands, as the patch on its mark says it: Needs setup, with why on hover, when it can't run as it
 * is set up; otherwise, while it is at work, that it is, with where on hover, such as "Working in #general". A ready
 * agent that is idle shows nothing, and so does one still on its way, since the server tells how ready a new agent is
 * once it has it.
 */
export const statusOfAgent = (
  { agent, pending }: AgentItem,
  activity: Option.Option<AgentActivity>
): MarkStatus | undefined =>
  pending
    ? undefined
    : Agent.Readiness.match(agent.readiness, {
        Ready: (): MarkStatus | undefined =>
          Option.getOrUndefined(Option.map(activity, (at) => ({ kind: "available", label: activityLabel(at) }))),
        Incomplete: ({ issues }): MarkStatus | undefined => ({
          kind: "attention",
          label: "Needs setup",
          detail: issueSentence(issues[0])
        })
      })

/** What a sidebar row says of the agent being at work: the words, and how the logo moves, as its state does. */
export const sidebarActivity = (activity: Option.Option<AgentActivity>) =>
  Option.match(activity, {
    onNone: () => ({}),
    onSome: (at) => ({ activity: activityLabel(at), activityMotion: motionOfState[at.state] })
  })
