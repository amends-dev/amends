/**
 * How an agent stands and what it is doing, as a row of the sidebar says it: the patch on its mark, and the words and
 * the motion of its logo. The agents' section and the direct messages with an agent draw the same.
 */

import { Agent } from "@amends-dev/core/agent"
import type { ReplicaRecord } from "@amends-dev/core/replica"
import type { MarkStatus } from "@amends-dev/design/mark"
import * as Option from "effect/Option"
import { activityLabel, type AgentActivity, motionOfState } from "./agentActivity.ts"

/** An agent of the workspace, and whether a change to it is on its way. */
type StoredAgent = Readonly<{ agent: ReplicaRecord.Agent; pending: boolean }>

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
  { agent, pending }: StoredAgent,
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
