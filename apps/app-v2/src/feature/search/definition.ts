/**
 * Jumping anywhere in the workspace, as `apps/ui`'s Jump to does: a palette over the page, with a field and, under it,
 * the places that match what is typed, in sections: the pages (Go to), the groups, the people, the agents, and, after
 * `apps/ui`'s sections, the threads, which the arrow keys walk and Enter or a click opens. Before anything is typed each
 * section lists its first five, and while typing its best eight. The palette reads where the person can jump to from
 * their store while it is open, and ranks it as they type. It opens when its parent asks, and reports the page, the
 * group, the thread, the person, or the agent the item opened is.
 */

import { Group, GroupId } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { Thread, ThreadId } from "@amends-dev/core/thread"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { foldAccents } from "../../seen.ts"

/** A page the person can go to, as the rail or the account menu does. */
export const Destination = Schema.Literals(["Inbox", "Agents", "Connections", "Settings"])
export type Destination = typeof Destination.Type

/** The pages under Go to, in the order `apps/ui` lists them. */
export const destinations: ReadonlyArray<Destination> = ["Inbox", "Agents", "Connections", "Settings"]

/** A group the person can jump to, with its name as they read it. */
export const NamedGroup = Schema.Struct({ group: Group.Group, name: Schema.String })
export type NamedGroup = typeof NamedGroup.Type

/**
 * A thread the person can jump to, with the name of its group, the words they read it by, and the words of its opening,
 * which they may know it by as well when it has a title.
 */
export const WordedThread = Schema.Struct({
  thread: Thread.Thread,
  groupName: Schema.String,
  words: Schema.String,
  openingWords: Schema.Option(Schema.String)
})
export type WordedThread = typeof WordedThread.Type

/** An agent the person can jump to: the identity it works as, and the member it is, which has its name. */
export const NamedAgent = Schema.Struct({ agentId: Identity.AgentId, member: Member.Member })
export type NamedAgent = typeof NamedAgent.Type

/** What the store says the person can jump to, besides the pages. */
export const JumpTargets = Schema.Struct({
  groups: Schema.Array(NamedGroup),
  threads: Schema.Array(WordedThread),
  people: Schema.Array(Member.Member),
  agents: Schema.Array(NamedAgent)
})
export type JumpTargets = typeof JumpTargets.Type

/** Where the read of what the person can jump to stands: not answered yet, answered, or failed. */
export const SearchStatus = defineTaggedUnion({
  Reading: {},
  Read: { targets: JumpTargets },
  Failed: { error: Schema.String }
})
export type SearchStatus = typeof SearchStatus.Type

/** One place the person can open: a page, a group, a person, an agent, or a thread. */
export const Item = defineTaggedUnion({
  Destination: { destination: Destination },
  Group: NamedGroup.fields,
  Person: { member: Member.Member },
  Agent: NamedAgent.fields,
  Thread: WordedThread.fields
})
export type Item = typeof Item.Type

/**
 * Whose search, what is typed in its field, where the read of the places stands, which item is active, and the
 * dialog it is in.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  query: Schema.String,
  status: SearchStatus,
  activeIndex: Schema.Int,
  dialog: DialogBlock.Model
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  RequestedOpen: {},
  ReceivedTargets: { targets: JumpTargets },
  FailedRead: { error: Schema.String },
  TypedQuery: { query: Schema.String },
  MovedActive: { to: Schema.Int },
  CompletedScrollToItem: {},
  ChoseActive: {},
  ClickedItem: { item: Item }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  OpenedDestination: { destination: Destination },
  OpenedGroup: { groupId: GroupId.GroupId },
  OpenedThread: { groupId: GroupId.GroupId, threadId: ThreadId.ThreadId },
  OpenedPerson: { memberId: MemberId.MemberId },
  OpenedAgent: { agentId: Identity.AgentId }
})
export type OutMessage = typeof OutMessage.Type

export const SearchDefinition = Block.makeDefinition("Search", { Model, Message, OutMessage })

/** How many of a section's items show before anything is typed, and while typing, as in `apps/ui`. */
const browsingLimit = 5
const searchingLimit = 8

/** What is typed as it is matched: case and accents aside, and a leading "#" or "@" ignored, as people write names. */
const queryOf = (typed: string): string => foldAccents(typed).trim().replace(/^[#@]/u, "")

/** How well a name matches the query: its start (3), a word's start (2), anywhere (1), or not at all (0). */
const scoreOf = (name: string, query: string): number => {
  if (query === "") {
    return 1
  }

  const folded = foldAccents(name).trim()

  if (folded.startsWith(query)) {
    return 3
  }

  if (folded.split(/[\s\-_·./]+/u).some((word) => word.startsWith(query))) {
    return 2
  }

  return folded.includes(query) ? 1 : 0
}

/** The names an item is found by: its label, and a thread's opening's words too. */
const namesOf = (item: Item): ReadonlyArray<string> =>
  Item.match(item, {
    Destination: ({ destination }) => [destination],
    Group: ({ name }) => [name],
    Person: ({ member }) => [member.name],
    Agent: ({ member }) => [member.name],
    Thread: ({ words, openingWords }) => [words, ...Option.toArray(openingWords)]
  })

/** The items matching the query, best first, and in the order they came in among those as good, at most `limit`. */
const rank = (items: ReadonlyArray<Item>, query: string, limit: number): ReadonlyArray<Item> =>
  items
    .map((item) => ({ item, score: Math.max(...namesOf(item).map((name) => scoreOf(name, query))) }))
    .filter(({ score }) => score > 0)
    .toSorted((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ item }) => item)

/** A section of items under its title. */
export type ItemSection = Readonly<{
  title: "Go to" | "Groups" | "People" | "Agents" | "Threads"
  items: ReadonlyArray<Item>
}>

/**
 * The items that match `typed`, in sections that keep the order `apps/ui`'s do and the threads after them: the pages,
 * the groups, the people, the agents, and the threads, each at most five before anything is typed and eight while
 * typing, best first, and a section with nothing in it left out.
 */
export const sectionsOf = (targets: JumpTargets, typed: string): ReadonlyArray<ItemSection> => {
  const query = queryOf(typed)
  const limit = query === "" ? browsingLimit : searchingLimit
  const sections: ReadonlyArray<ItemSection> = [
    { title: "Go to", items: destinations.map((destination) => Item.Destination({ destination })) },
    { title: "Groups", items: targets.groups.map((named) => Item.Group(named)) },
    { title: "People", items: targets.people.map((member) => Item.Person({ member })) },
    { title: "Agents", items: targets.agents.map((named) => Item.Agent(named)) },
    { title: "Threads", items: targets.threads.map((worded) => Item.Thread(worded)) }
  ]

  return sections
    .map(({ title, items }) => ({ title, items: rank(items, query, limit) }))
    .filter(({ items }) => !Array.isReadonlyArrayEmpty(items))
}

const noTargets: JumpTargets = { groups: [], threads: [], people: [], agents: [] }

/** What the person has, in the order they walk it: the sections that match what is typed, while the read allows. */
export const sectionsShown = (model: Model): ReadonlyArray<ItemSection> =>
  SearchStatus.match(model.status, {
    Reading: () => sectionsOf(noTargets, model.query),
    Read: ({ targets }) => sectionsOf(targets, model.query),
    Failed: () => []
  })

/** The items shown as one list, the order the person walks it in. */
export const shownItems = (model: Model): ReadonlyArray<Item> => sectionsShown(model).flatMap(({ items }) => items)

/** The item the person has reached with the arrow keys. */
export const activeItem = (model: Model): Option.Option<Item> => Array.get(shownItems(model), model.activeIndex)

/** The id of the element that opens `item`, which the field names as its active descendant. */
export const itemId = (item: Item): string =>
  Item.match(item, {
    Destination: ({ destination }) => `search-destination-${destination.toLowerCase()}`,
    Group: ({ group }) => `search-group-${group.id}`,
    Person: ({ member }) => `search-person-${member.id}`,
    Agent: ({ agentId }) => `search-agent-${agentId}`,
    Thread: ({ thread }) => `search-thread-${thread.id}`
  })

/**
 * The targets with each kind in the order the person would list them: the groups with general first and then by name
 * as they read it, the people and the agents by name, and the threads newest first, so that the first five of a section
 * are those the person most likely wants.
 */
export const orderTargets = ({ groups, threads, people, agents }: JumpTargets): JumpTargets => ({
  groups: Array.sort(
    groups,
    Order.combineAll([
      Order.mapInput(Order.Boolean, ({ group }: NamedGroup) => !Group.isGeneral(group)),
      Order.mapInput(Order.String, ({ name }: NamedGroup) => foldAccents(name)),
      Order.mapInput(Order.String, ({ group }: NamedGroup) => group.id)
    ])
  ),
  threads: Array.sort(
    threads,
    Order.mapInput(Order.flip(DateTime.Order), ({ thread }: WordedThread) => thread.createdAt)
  ),
  people: Array.sort(
    people,
    Order.mapInput(Order.String, ({ name }: Member.Member) => foldAccents(name))
  ),
  agents: Array.sort(
    agents,
    Order.mapInput(Order.String, ({ member }: NamedAgent) => foldAccents(member.name))
  )
})
