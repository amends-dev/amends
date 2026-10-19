import { Grant, Scope } from "@amends-dev/core/authorization"
import { Group, GroupFollow, GroupMembershipPermissions, GroupPermissions } from "@amends-dev/core/group"
import { ThreadId } from "@amends-dev/core/thread"
import { describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import {
  Command,
  change,
  click,
  expect,
  given,
  inside,
  label,
  role,
  scene,
  selector,
  text,
  type,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { aliceInDesign, bob, bobInDesign, design, membership, opening, thread } from "../../../test/fixtures.ts"
import { AdmitMember, RemoveMember, RenameGroup } from "./command.ts"
import { Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { threadView, view } from "./view.ts"

const { workspace, member } = membership
const threadId = ThreadId.ThreadId.make("thread-1")

/** A public team the person does not belong to. */
const announcements = Schema.decodeSync(Group.Group)({
  id: "announcements",
  workspaceId: "workspace-1",
  kind: "Team",
  visibility: "Public",
  name: "Announcements",
  createdBy: "member-2",
  createdAt: "2026-10-18T12:00:00Z"
})

/** The conversation between the person and Bob. */
const withBob = Schema.decodeSync(Group.Group)({
  id: "direct-1",
  workspaceId: "workspace-1",
  kind: "Direct",
  memberIds: ["member-1", "member-2"],
  createdBy: "member-1",
  createdAt: "2026-10-18T12:00:00Z"
})

/** The person's follow of design, as it was before they unfollowed it. */
const followOfDesign = Schema.decodeSync(GroupFollow.GroupFollow)({
  id: "follow-1",
  workspaceId: "workspace-1",
  groupId: "design",
  memberId: "member-1",
  groupMembershipId: "membership-2",
  followedAt: "2026-10-18T12:00:00Z",
  status: "active",
  endedAt: null
})

const inWorkspace = Scope.Scope.cases.Workspace.make({ workspaceId: workspace.id })

/** The team read, with alice and bob admitted, as a member who manages its members sees it. */
const opened: Model = modifyFields(init(workspace.id, member.id, design.id, Option.none()).model, {
  group: () => Option.some({ group: design, pending: false }),
  memberships: () => [
    { membership: aliceInDesign, pending: false },
    { membership: bobInDesign, pending: false }
  ],
  members: () => [member, bob],
  grants: () => [Grant.make(GroupMembershipPermissions.Manage, inWorkspace)]
})

/** The team with a thread open in it, titled. */
const withThread = modifyFields(
  modifyFields(init(workspace.id, member.id, design.id, Option.some(threadId)).model, {
    group: () => opened.group,
    memberships: () => opened.memberships,
    members: () => opened.members,
    grants: () => opened.grants
  }),
  {
    thread: Option.map((open) => ({
      ...open,
      model: modifyFields(open.model, { title: () => Option.some("Composer paste crash") })
    }))
  }
)

describe("a group's main pane", () => {
  it("is the main landmark titled by the group's name, with the person's part in it and its members", () => {
    scene(
      { update, view },
      given(opened),
      expect(role("main", { name: "Design" })).toExist(),
      expect(role("heading", { name: "Design", level: 1 })).toExist(),
      expect(within(role("main"), role("button", { name: "Follow" }))).toExist(),
      expect(within(role("main"), role("button", { name: "Leave" }))).toExist(),
      expect(role("button", { name: "Rename" })).toBeAbsent(),
      inside(
        role("region", { name: "Members" }),
        inside(
          role("list", { name: "Members" }),
          expect(text("Alice")).toExist(),
          expect(text("Bob")).toExist(),
          expect(role("button", { name: "Remove" })).toExist()
        )
      ),
      expect(text("Choose a member")).toBeAbsent(),
      expect(text("No threads yet.")).toExist()
    )
  })

  it("marks a member who has the workspace open as online", () => {
    scene(
      { update, view },
      given(opened),
      inside(role("list", { name: "Members" }), expect(text("Online")).toBeAbsent())
    )
    scene(
      { update, view },
      given(modifyFields(opened, { present: () => [{ memberId: bob.id, typingIn: null }] })),
      inside(role("list", { name: "Members" }), expect(text("Online")).toExist())
    )
  })

  it("marks an admission that is on its way, and offers no button to remove it", () => {
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          memberships: () => [
            { membership: aliceInDesign, pending: false },
            { membership: bobInDesign, pending: true }
          ]
        })
      ),
      inside(
        role("list", { name: "Members" }),
        expect(text("Bob")).toExist(),
        expect(text(" · Sending…")).toExist(),
        expect(role("button", { name: "Remove" })).toBeAbsent()
      )
    )
  })

  it("removes a member and admits another, where the person manages them", () => {
    const inDesign = { workspaceId: workspace.id, memberId: member.id, groupId: design.id }
    scene(
      { update, view },
      given(modifyFields(opened, { memberships: () => [{ membership: aliceInDesign, pending: false }] })),
      inside(role("list", { name: "Members" }), expect(text("Alice")).toExist()),
      inside(
        role("form", { name: "Add a member" }),
        change(role("combobox", { name: "Add a member" }), bob.id),
        click(role("button", { name: "Add" }))
      ),
      Command.expectExact(AdmitMember({ ...inDesign, admitMemberId: bob.id })),
      Command.resolve(AdmitMember, Message.WroteAction())
    )
    scene(
      { update, view },
      given(opened),
      inside(role("list", { name: "Members" }), click(role("button", { name: "Remove" }))),
      Command.expectExact(RemoveMember({ ...inDesign, membershipId: bobInDesign.id })),
      Command.resolve(RemoveMember, Message.WroteAction())
    )
  })

  it("shows the members to someone who may not manage them, with no way to remove or add", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { grants: () => [] })),
      inside(role("list", { name: "Members" }), expect(text("Bob")).toExist()),
      expect(role("button", { name: "Remove" })).toBeAbsent(),
      expect(role("form", { name: "Add a member" })).toBeAbsent()
    )
  })

  it("holds the composer to start a thread in its footer, named for the group", () => {
    scene(
      { update, view },
      given(opened),
      expect(within(role("main", { name: "Design" }), role("form", { name: "Start a thread" }))).toExist(),
      expect(label("Start a thread")).toHaveAttr("placeholder", "Message Design"),
      expect(within(role("main", { name: "Design" }), role("button", { name: "Start" }))).toExist()
    )
  })

  it("lists the group's threads as messages, the thread open in it marked as current", () => {
    scene(
      { update, view },
      given(
        modifyFields(withThread, {
          threads: (threads) =>
            modifyFields(threads, {
              threads: () => [
                {
                  thread: { ...thread, groupId: design.id },
                  opening: Option.some(opening),
                  task: Option.none(),
                  pending: false,
                  unread: 0
                }
              ]
            })
        })
      ),
      expect(within(role("list", { name: "Threads" }), role("button", { name: "Plans for the week" }))).toExist(),
      expect(within(selector('[aria-current="true"]'), text("Plans for the week"))).toExist()
    )
  })

  it("offers joining a public team the person does not belong to, in place of its threads", () => {
    scene(
      { update, view },
      given(
        modifyFields(init(workspace.id, member.id, announcements.id, Option.none()).model, {
          group: () => Option.some({ group: announcements, pending: false }),
          members: () => [member, bob]
        })
      ),
      expect(role("heading", { name: "Announcements", level: 1 })).toExist(),
      expect(role("button", { name: "Join" })).toExist(),
      expect(role("button", { name: "Follow" })).toBeAbsent(),
      expect(text("Join this team to read its threads.")).toExist(),
      expect(role("form", { name: "Start a thread" })).toBeAbsent()
    )
  })

  it("offers admitting a member who is not in the team, from the members' choice", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { memberships: () => [{ membership: aliceInDesign, pending: false }] })),
      expect(text("Choose a member")).toExist(),
      expect(role("button", { name: "Add" })).toExist()
    )
  })

  it("is titled by the other member of a conversation, marked by their first letter, with no members", () => {
    scene(
      { update, view },
      given(
        modifyFields(init(workspace.id, member.id, withBob.id, Option.none()).model, {
          group: () => Option.some({ group: withBob, pending: false }),
          members: () => [member, bob]
        })
      ),
      expect(role("heading", { name: "Bob", level: 1 })).toExist(),
      expect(within(role("main", { name: "Bob" }), text("B"))).toExist(),
      expect(role("heading", { name: "Members" })).toBeAbsent(),
      expect(role("button", { name: "Leave" })).toBeAbsent(),
      expect(label("Start a thread")).toHaveAttr("placeholder", "Message Bob")
    )
  })

  it("renames a team from its header, in a form in the body, for someone who may", () => {
    scene(
      { update, view },
      given(
        modifyFields(opened, { grants: (grants) => [...grants, Grant.make(GroupPermissions.Rename, inWorkspace)] })
      ),
      click(role("button", { name: "Rename" })),
      expect(role("button", { name: "Rename" })).toBeAbsent(),
      type(label("Name"), "Design team"),
      click(role("button", { name: "Save" })),
      Command.expectExact(
        RenameGroup({
          workspaceId: workspace.id,
          memberId: member.id,
          groupId: design.id,
          name: "Design team",
          expectedName: "Design"
        })
      ),
      Command.resolve(RenameGroup, Message.WroteAction()),
      expect(label("Name")).toBeAbsent()
    )
  })

  it("marks a change to the person's follow that is on its way, and offers no button for it", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { follow: () => Option.some({ follow: followOfDesign, pending: true }) })),
      expect(text(" · Sending…")).toExist(),
      expect(role("button", { name: "Unfollow" })).toBeAbsent(),
      expect(role("button", { name: "Follow" })).toBeAbsent()
    )
  })

  it("holds no thread, which it shows in the side pane, while one is open", () => {
    scene(
      { update, view },
      given(withThread),
      expect(role("main", { name: "Design" })).toExist(),
      expect(role("complementary")).toBeAbsent(),
      expect(role("heading", { name: "Composer paste crash" })).toBeAbsent()
    )
  })
})

/** The side pane in a page of its own, so that the scene has a view while no thread is open. */
const sidePane = (model: Parameters<typeof threadView>[0], h: Parameters<typeof threadView>[1]) =>
  h.div([], [threadView(model, h)])

describe("a group's side pane", () => {
  it("is the complementary landmark named Thread, titled by the thread, saying which group it is in", () => {
    scene(
      { update, view: threadView },
      given(withThread),
      expect(role("complementary", { name: "Thread" })).toExist(),
      expect(
        within(role("complementary", { name: "Thread" }), role("heading", { name: "Composer paste crash", level: 2 }))
      ).toExist(),
      expect(within(role("complementary", { name: "Thread" }), text("Thread in Design"))).toExist(),
      expect(within(role("complementary", { name: "Thread" }), role("region", { name: "Thread" }))).toExist()
    )
  })

  it("holds the composer to reply in its footer, beside the thread's messages", () => {
    scene(
      { update, view: threadView },
      given(withThread),
      expect(within(role("complementary", { name: "Thread" }), role("form", { name: "Reply" }))).toExist(),
      expect(label("Reply")).toHaveAttr("placeholder", "Reply in thread"),
      expect(within(role("complementary", { name: "Thread" }), role("button", { name: "Reply" }))).toExist(),
      expect(within(role("complementary", { name: "Thread" }), role("list", { name: "Messages" }))).toExist()
    )
  })

  it("closes with a button named Close, back to the group's threads", () => {
    scene(
      { update, view: sidePane },
      given(withThread),
      click(role("button", { name: "Close" })),
      expect(role("complementary")).toBeAbsent()
    )
  })

  it("renders nothing while no thread is open", () => {
    scene({ update, view: sidePane }, given(opened), expect(role("complementary")).toBeAbsent())
  })
})
