/**
 * A choice of a workspace member, over the design's select: the empty choice, as `none` reads, is none.
 */

import type { Member } from "@amends-dev/core/workspace"
import { choiceSelect } from "@amends-dev/design/control"
import * as Option from "effect/Option"
import type { HtmlBuilder } from "foldkit/html"

/** A choice of one of `members`, or none until one is chosen. */
export const memberChoice = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    id: string
    label: string
    none: string
    members: ReadonlyArray<Member.Member>
    value: Option.Option<Member.Member["id"]>
    onChange: (memberId: Option.Option<Member.Member["id"]>) => Message
  }>
) =>
  choiceSelect<string, Message, Requirements>(h, {
    id: config.id,
    label: config.label,
    choices: [["", config.none], ...config.members.map((member) => [member.id, member.name] as const)],
    value: Option.getOrElse(config.value, () => ""),
    onChange: (value) =>
      config.onChange(Option.fromUndefinedOr(config.members.find((member) => member.id === value)?.id))
  })
