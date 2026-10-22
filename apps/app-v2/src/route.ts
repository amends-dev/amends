/** Durable destinations. URLs contain identity and selection, never session tokens or form drafts. */

import { Connection, Integration } from "@amends-dev/connection"
import { GroupId } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { Notification } from "@amends-dev/core/notification"
import { ThreadId } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { defineTaggedUnion } from "foldkit/schema"
import type { Url } from "foldkit/url"

export const InboxSelection = Schema.Struct({
  notificationId: Notification.NotificationId,
  groupId: GroupId.GroupId,
  threadId: ThreadId.ThreadId
})

export const HomeDestination = defineTaggedUnion({
  Inbox: { tab: Schema.Literals(["Unread", "All"]), selected: Schema.Option(InboxSelection) },
  Triage: {},
  Tasks: {},
  Groups: {},
  Group: { groupId: GroupId.GroupId, threadId: Schema.Option(ThreadId.ThreadId) },
  Conversation: { memberIds: Schema.NonEmptyArray(MemberId.MemberId) }
})
export type HomeDestination = typeof HomeDestination.Type

export const Destination = defineTaggedUnion({
  Home: { destination: HomeDestination },
  Connections: { tab: Schema.Union([Schema.Literal("all"), Integration.Capability]) },
  Connection: { connectionId: Connection.ConnectionId },
  Agents: { tab: Schema.Literals(["All", "NeedsSetup"]) },
  Agent: { agentId: Identity.AgentId },
  Settings: { page: Schema.Literals(["Workspace", "Members"]), memberId: Schema.Option(MemberId.MemberId) },
  Channels: {}
})
export type Destination = typeof Destination.Type

export const Route = defineTaggedUnion({
  Workspaces: {},
  Workspace: { workspaceId: WorkspaceId.WorkspaceId, destination: Destination },
  NotFound: { path: Schema.String }
})
export type Route = typeof Route.Type

export const sameRoute = Schema.toEquivalence(Route)

export const inbox = () => HomeDestination.Inbox({ tab: "Unread", selected: Option.none() })
export const home = () => Destination.Home({ destination: inbox() })

const segment = encodeURIComponent
const optionalSegment = (value: Option.Option<string>) =>
  Option.match(value, {
    onNone: () => "",
    onSome: (id) => `/${segment(id)}`
  })

const homePath = HomeDestination.match({
  Inbox: ({ tab, selected }) => {
    const query = new URLSearchParams()
    if (tab === "All") query.set("tab", "all")
    if (Option.isSome(selected)) {
      query.set("notification", selected.value.notificationId)
      query.set("group", selected.value.groupId)
      query.set("thread", selected.value.threadId)
    }
    return `inbox${query.size === 0 ? "" : `?${query}`}`
  },
  Triage: () => "triage",
  Tasks: () => "tasks",
  Groups: () => "groups",
  Group: ({ groupId, threadId }) =>
    `groups/${segment(groupId)}${Option.match(threadId, {
      onNone: () => "",
      onSome: (id) => `/threads/${segment(id)}`
    })}`,
  Conversation: ({ memberIds }) => {
    const query = new URLSearchParams()
    for (const id of [...new Set(memberIds)].sort()) query.append("member", id)
    return `conversations/new?${query}`
  }
})

export const destinationPath = Destination.match({
  Home: ({ destination }) => homePath(destination),
  Connections: ({ tab }) => `connections${tab === "all" ? "" : `?tab=${segment(tab)}`}`,
  Connection: ({ connectionId }) => `connections/${segment(connectionId)}`,
  Agents: ({ tab }) => `agents${tab === "All" ? "" : "?tab=needs-setup"}`,
  Agent: ({ agentId }) => `agents/${segment(agentId)}`,
  Settings: ({ page, memberId }) =>
    page === "Workspace" ? "settings" : `settings/members${optionalSegment(memberId)}`,
  Channels: () => "channels"
})

export const href = Route.match({
  Workspaces: () => "/",
  Workspace: ({ workspaceId, destination }) => `/workspaces/${segment(workspaceId)}/${destinationPath(destination)}`,
  NotFound: ({ path }) => path
})

/** Decode exactly one path segment. Malformed escapes and empty IDs are invalid, not partial matches. */
const segmentsOf = (pathname: string): Option.Option<ReadonlyArray<string>> => {
  try {
    const parts = pathname.replace(/\/$/, "").split("/").slice(1).map(decodeURIComponent)
    return parts.some((part) => part === "" || part === "." || part === "..") ? Option.none() : Option.some(parts)
  } catch {
    return Option.none()
  }
}

const decodeDestination = Schema.decodeUnknownOption(Destination)

/** Query values are validated with the same schemas as the destinations. Unknown keys are ignored. */
const parseDestination = (parts: ReadonlyArray<string>, query: URLSearchParams): Option.Option<Destination> => {
  const [section, id, detail, selected] = parts
  const homeDestination = (value: unknown) => decodeDestination({ _tag: "Home", destination: value })
  if (parts.length === 0) return Option.some(home())
  if (parts.length === 1) {
    if (section === "inbox") {
      const tab = query.get("tab")
      if (tab !== null && tab !== "all" && tab !== "unread") return Option.none()
      const selection = [query.get("notification"), query.get("group"), query.get("thread")]
      if (selection.some((id) => id !== null) && selection.some((id) => id === null)) return Option.none()
      return homeDestination({
        _tag: "Inbox",
        tab: tab === "all" ? "All" : "Unread",
        selected:
          selection[0] === null
            ? Option.none()
            : Option.some({ notificationId: selection[0], groupId: selection[1], threadId: selection[2] })
      })
    }
    if (section === "triage") return Option.some(Destination.Home({ destination: HomeDestination.Triage() }))
    if (section === "tasks") return Option.some(Destination.Home({ destination: HomeDestination.Tasks() }))
    if (section === "groups") return Option.some(Destination.Home({ destination: HomeDestination.Groups() }))
    if (section === "connections") return decodeDestination({ _tag: "Connections", tab: query.get("tab") ?? "all" })
    if (section === "agents") {
      const tab = query.get("tab")
      return tab === null || tab === "all" || tab === "needs-setup"
        ? decodeDestination({ _tag: "Agents", tab: tab === "needs-setup" ? "NeedsSetup" : "All" })
        : Option.none()
    }
    if (section === "settings") return Option.some(Destination.Settings({ page: "Workspace", memberId: Option.none() }))
    if (section === "channels") return Option.some(Destination.Channels())
  }
  if (parts.length === 2) {
    if (section === "groups") return homeDestination({ _tag: "Group", groupId: id, threadId: Option.none() })
    if (section === "agents") return decodeDestination({ _tag: "Agent", agentId: id })
    if (section === "connections") return decodeDestination({ _tag: "Connection", connectionId: id })
    if (section === "settings" && id === "members")
      return Option.some(Destination.Settings({ page: "Members", memberId: Option.none() }))
    if (section === "conversations" && id === "new")
      return homeDestination({ _tag: "Conversation", memberIds: [...new Set(query.getAll("member"))].sort() })
  }
  if (parts.length === 3 && section === "settings" && id === "members")
    return decodeDestination({ _tag: "Settings", page: "Members", memberId: Option.some(detail) })
  if (parts.length === 4 && section === "groups" && detail === "threads")
    return homeDestination({ _tag: "Group", groupId: id, threadId: Option.some(selected) })
  return Option.none()
}

export const fromUrl = (url: Pick<Url, "pathname" | "search">): Route => {
  if (url.pathname === "/") return Route.Workspaces()
  const parsed = Option.flatMap(segmentsOf(url.pathname), (parts) => {
    if (parts[0] !== "workspaces" || parts.length < 2) return Option.none()
    const query = new URLSearchParams(Option.getOrElse(url.search, () => ""))
    // A single-valued selection must not silently depend on parameter order.
    if (["tab", "notification", "group", "thread"].some((key) => query.getAll(key).length > 1)) return Option.none()
    return Option.flatMap(parseDestination(parts.slice(2), query), (destination) =>
      Schema.decodeUnknownOption(Route.Workspace)({ _tag: "Workspace", workspaceId: parts[1], destination })
    )
  })
  return Option.getOrElse(parsed, () => Route.NotFound({ path: url.pathname }))
}
