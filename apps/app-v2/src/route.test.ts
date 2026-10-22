import { Connection } from "@amends-dev/connection"
import { GroupId } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { Notification } from "@amends-dev/core/notification"
import { ThreadId } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import * as Url from "foldkit/url"
import { Destination, HomeDestination, Route, fromUrl, href } from "./route.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("studio/東京 ?#%")
const groupId = GroupId.GroupId.make("team/a #?%")
const threadId = ThreadId.ThreadId.make("thread/1")
const memberId = MemberId.MemberId.make("person/1")
const parse = (path: string) => fromUrl(Option.getOrThrow(Url.fromString(`https://amends.test${path}`)))
const inWorkspace = (destination: Destination) => Route.Workspace({ workspaceId, destination })

const destinations = [
  Destination.Home({ destination: HomeDestination.Inbox({ tab: "Unread", selected: Option.none() }) }),
  Destination.Home({
    destination: HomeDestination.Inbox({
      tab: "All",
      selected: Option.some({ notificationId: Notification.NotificationId.make("notice/1"), groupId, threadId })
    })
  }),
  Destination.Home({ destination: HomeDestination.Triage() }),
  Destination.Home({ destination: HomeDestination.Tasks() }),
  Destination.Home({ destination: HomeDestination.Groups() }),
  Destination.Home({ destination: HomeDestination.Group({ groupId, threadId: Option.none() }) }),
  Destination.Home({ destination: HomeDestination.Group({ groupId, threadId: Option.some(threadId) }) }),
  Destination.Home({ destination: HomeDestination.Conversation({ memberIds: [memberId] }) }),
  Destination.Agents({ tab: "All" }),
  Destination.Agents({ tab: "NeedsSetup" }),
  Destination.Agent({ agentId: Identity.AgentId.make("agent/1") }),
  Destination.Connections({ tab: "all" }),
  Destination.Connection({ connectionId: Connection.ConnectionId.make("connection/1") }),
  Destination.Settings({ page: "Workspace", memberId: Option.none() }),
  Destination.Settings({ page: "Members", memberId: Option.none() }),
  Destination.Settings({ page: "Members", memberId: Option.some(memberId) }),
  Destination.Channels()
]

describe("destination URLs", () => {
  it.each(destinations)("round trips $._tag with encoded identities", (destination) => {
    const route = inWorkspace(destination)
    expect(parse(href(route))).toEqual(route)
  })

  it("uses the picker at the root and the inbox at a bare workspace URL", () => {
    expect(parse("/")).toEqual(Route.Workspaces())
    expect(href(parse("/workspaces/studio"))).toBe("/workspaces/studio/inbox")
    expect(href(parse("/workspaces/studio/"))).toBe("/workspaces/studio/inbox")
  })

  it.each([
    "/missing",
    "/workspaces",
    "/workspaces//inbox",
    "/workspaces/%/inbox",
    "/workspaces/%E0%A4/inbox",
    "/workspaces/a/no-such-page",
    "/workspaces/a/tasks/extra",
    "/workspaces/a/groups/g/threads",
    "/workspaces/a/settings/members/m/extra",
    "/workspaces/a/inbox?tab=wrong",
    "/workspaces/a/inbox?tab=all&tab=unread",
    "/workspaces/a/inbox?notification=n",
    "/workspaces/a/inbox?notification=&group=g&thread=t",
    "/workspaces/a/connections?tab=wrong",
    "/workspaces/a/agents?tab=wrong",
    "/workspaces/a/conversations/new",
    "/workspaces/a/conversations/new?member="
  ])("rejects malformed or unknown destinations: %s", (path) => {
    expect(Route.isAnyOf(["NotFound"])(parse(path))).toBe(true)
  })

  it("ignores incidental query parameters and fragments", () => {
    expect(parse("/workspaces/a/tasks?campaign=test#main-pane")).toEqual(parse("/workspaces/a/tasks"))
  })

  it("keeps conversations canonical regardless of recipient order and duplicates", () => {
    expect(href(parse("/workspaces/a/conversations/new?member=z&member=b&member=z"))).toBe(
      "/workspaces/a/conversations/new?member=b&member=z"
    )
  })
})
