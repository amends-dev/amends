import { GroupId } from "@amends-dev/core/group"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { inputId } from "@foldkit/ui/combobox"
import { Array, DateTime, Effect, Layer, Option } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import {
  aliceInDesign,
  aliceInGeneral,
  bob,
  conversationWithBob,
  design,
  general,
  scoutAgent,
  turnOf
} from "../../../test/fixtures.ts"
import { recordingStores } from "../../../test/recordingStores.ts"
import { CreateTeam, FocusStartingMembers, JoinGroup, MarkGroupRead } from "./command.ts"
import { DialogBinding } from "./composition.ts"
import {
  byGeneralThenName,
  conversationIn,
  conversationWith,
  discoverable,
  hasNewActivityIn,
  Message,
  OutMessage,
  Starting,
  startingMembersId,
  teamIn,
  waitingIn,
  yourTeams
} from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const bobId = MemberId.MemberId.make("member-2")
const carolId = MemberId.MemberId.make("member-9")
const groupId = GroupId.GroupId.make("general")

const listed = init(workspaceId, memberId).model

/** The form of a team just asked for: unnamed, private, with no one added besides the person. */
const blankTeam = Starting.Team({
  name: "",
  visibility: "Private",
  memberIds: [],
  creating: Option.none(),
  failure: Option.none()
})

/** A public team the person does not belong to. */
const launches = { ...general, id: GroupId.GroupId.make("launches"), name: "launches" }

/** A private team the person does not belong to, which nothing offers them. */
const secret = { ...design, id: GroupId.GroupId.make("secret"), name: "secret" }

/** The groups read: two teams the person belongs to, a public and a private team they do not, and a conversation. */
const browsing = modifyFields(listed, {
  isLoaded: () => true,
  groups: () => [
    { group: general, pending: false, members: 2 },
    { group: design, pending: false, members: 1 },
    { group: launches, pending: false, members: 3 },
    { group: secret, pending: false, members: 1 },
    { group: conversationWithBob, pending: false, members: 2 }
  ],
  members: () => [bob],
  memberships: () => [aliceInGeneral, aliceInDesign]
})

/** The write of joining the team `launches`, as the person's command makes it. */
const joinLaunches = JoinGroup({ workspaceId, memberId, groupId: launches.id })

/** What the dialog reports, as the groups receive it. */
const fromDialog = (message: typeof DialogBlock.Message.Type) =>
  DialogBinding.embedView({
    slotId: "starting",
    model: listed.dialog,
    viewInputs: { toView: () => null }
  }).toParentMessage(message)

describe("the groups", () => {
  it("start nothing, with the dialog closed, until the person asks", () => {
    story(
      update,
      given(listed),
      model((model) => {
        expect(model.starting).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
  })

  it("open the dialog on a blank team form, and on a blank conversation form", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedNewTeam()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      model((model) => {
        expect(model.starting).toEqual(Option.some(blankTeam))
        expect(model.dialog.isOpen).toBe(true)
      }),
      message(Message.ClickedNewConversation()),
      Command.expectNone(),
      model((model) => {
        expect(model.starting).toEqual(Option.some(Starting.Conversation({ memberIds: [] })))
        expect(model.dialog.isOpen).toBe(true)
      })
    )
  })

  it("write a team once, with the person and who they added as its members, and keep the form until it is listed", () => {
    story(
      update,
      given(browsing),
      message(Message.ClickedNewTeam()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.TypedTeamName({ name: "  Design review " })),
      message(Message.SubmittedTeam()),
      Command.expectExact(
        CreateTeam({ workspaceId, memberId, name: "Design review", visibility: "Private", memberIds: [memberId] })
      ),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(teamIn(model)).toEqual(
          Option.some(
            Starting.Team({
              name: "  Design review ",
              visibility: "Private",
              memberIds: [],
              creating: Option.some({
                name: "Design review",
                knownGroupIds: browsing.groups.map(({ group }) => group.id),
                isWritten: false
              }),
              failure: Option.none()
            })
          )
        )
      }),
      Command.resolve(CreateTeam, Message.SucceededCreateTeam()),
      expectNoOutMessage(),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
      }),
      message(Message.SubmittedTeam()),
      Command.expectNone()
    )
  })

  it("send the visibility and the members the person chose, with themself first", () => {
    const filledIn = modifyFields(browsing, {
      starting: () =>
        Option.some(
          Starting.Team({
            name: "Announcements",
            visibility: "Public",
            memberIds: [bobId],
            creating: Option.none(),
            failure: Option.none()
          })
        )
    })

    story(
      update,
      given(filledIn),
      message(Message.SubmittedTeam()),
      Command.expectExact(
        CreateTeam({
          workspaceId,
          memberId,
          name: "Announcements",
          visibility: "Public",
          memberIds: [memberId, bobId]
        })
      ),
      Command.resolve(CreateTeam, Message.SucceededCreateTeam())
    )
  })

  it("send nothing for a team with no name, or only spaces for one", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedNewTeam()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.SubmittedTeam()),
      Command.expectNone(),
      message(Message.TypedTeamName({ name: "   " })),
      message(Message.SubmittedTeam()),
      Command.expectNone(),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(Option.exists(teamIn(model), ({ creating }) => Option.isNone(creating))).toBe(true)
      })
    )
  })

  it("send nothing when no team is being started", () => {
    story(update, given(listed), message(Message.SubmittedTeam()), Command.expectNone())
  })

  it("close the dialog, mark the new team in the sidebar, and report it once it is listed", () => {
    const created = { ...design, id: GroupId.GroupId.make("design-review"), name: "Design review" }

    story(
      update,
      given(browsing),
      message(Message.ClickedNewTeam()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.TypedTeamName({ name: "Design review" })),
      message(Message.SubmittedTeam()),
      Command.resolve(CreateTeam, Message.SucceededCreateTeam()),
      message(
        Message.ReceivedGroups({
          groups: [...browsing.groups, { group: created, pending: true, members: 1 }],
          members: browsing.members,
          memberships: browsing.memberships,
          grants: browsing.grants
        })
      ),
      expectOutMessage(OutMessage.CreatedGroup({ groupId: created.id })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.selected).toEqual(Option.some(created.id))
        expect(model.starting).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
  })

  it("report the new team once it is both listed and kept, in whichever order the store tells the Block", () => {
    const created = { ...design, id: GroupId.GroupId.make("design-review"), name: "Design review" }
    const sent = modifyFields(browsing, {
      starting: () =>
        Option.some(
          Starting.Team({
            name: "Design review",
            visibility: "Private",
            memberIds: [],
            creating: Option.some({
              name: "Design review",
              knownGroupIds: browsing.groups.map(({ group }) => group.id),
              isWritten: false
            }),
            failure: Option.none()
          })
        )
    })

    story(
      update,
      given(sent),
      message(
        Message.ReceivedGroups({
          groups: [...browsing.groups, { group: created, pending: true, members: 1 }],
          members: browsing.members,
          memberships: browsing.memberships,
          grants: browsing.grants
        })
      ),
      expectNoOutMessage(),
      model((model) => {
        expect(teamIn(model)).not.toEqual(Option.none())
        expect(model.selected).toEqual(Option.none())
      }),
      message(Message.SucceededCreateTeam()),
      expectOutMessage(OutMessage.CreatedGroup({ groupId: created.id })),
      model((model) => {
        expect(model.selected).toEqual(Option.some(created.id))
      })
    )
  })

  it("tell the team the person made from one of the same name that was listed before, or that someone else made", () => {
    const sameName = { ...design, id: GroupId.GroupId.make("design-too"), name: "Design review", createdBy: bobId }
    const alreadyThere = { ...design, id: GroupId.GroupId.make("design-old"), name: "Design review" }
    const withOld = modifyFields(browsing, {
      groups: (groups) => [...groups, { group: alreadyThere, pending: false, members: 1 }]
    })

    story(
      update,
      given(withOld),
      message(Message.ClickedNewTeam()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.TypedTeamName({ name: "Design review" })),
      message(Message.SubmittedTeam()),
      Command.resolve(CreateTeam, Message.SucceededCreateTeam()),
      message(
        Message.ReceivedGroups({
          groups: [...withOld.groups, { group: sameName, pending: false, members: 1 }],
          members: withOld.members,
          memberships: withOld.memberships,
          grants: withOld.grants
        })
      ),
      expectNoOutMessage(),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.selected).toEqual(Option.none())
      })
    )
  })

  it("keep the form with why the team could not be written, and write it again when the person sends it again", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedNewTeam()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.TypedTeamName({ name: "Design" })),
      message(Message.SubmittedTeam()),
      Command.resolve(CreateTeam, Message.FailedCreateTeam({ error: "This browser could not keep the action." })),
      expectNoOutMessage(),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(teamIn(model)).toEqual(
          Option.some(
            Starting.Team({
              name: "Design",
              visibility: "Private",
              memberIds: [],
              creating: Option.none(),
              failure: Option.some("This browser could not keep the action.")
            })
          )
        )
      }),
      message(Message.SubmittedTeam()),
      Command.expectExact(
        CreateTeam({ workspaceId, memberId, name: "Design", visibility: "Private", memberIds: [memberId] })
      ),
      model((model) => {
        expect(Option.exists(teamIn(model), ({ failure }) => Option.isNone(failure))).toBe(true)
      }),
      Command.resolve(CreateTeam, Message.SucceededCreateTeam())
    )
  })

  it("take off the member whose chip the person removed, and ask for the input to take focus again", () => {
    const withMembers = modifyFields(listed, {
      starting: () =>
        Option.some(
          Starting.Team({
            name: "",
            visibility: "Private",
            memberIds: [bobId, MemberId.MemberId.make("member-3")],
            creating: Option.none(),
            failure: Option.none()
          })
        )
    })

    story(
      update,
      given(withMembers),
      message(Message.ClickedRemoveStartingMember({ memberId: bobId })),
      Command.expectExact(FocusStartingMembers({})),
      Command.resolve(FocusStartingMembers, Message.CompletedFocusStartingMembers()),
      model((model) => {
        expect(Option.map(teamIn(model), ({ memberIds }) => memberIds)).toEqual(
          Option.some([MemberId.MemberId.make("member-3")])
        )
      })
    )
  })

  it("take off the person whose chip was removed from the conversation being started the same way", () => {
    const choosing = modifyFields(listed, {
      starting: () => Option.some(Starting.Conversation({ memberIds: [bobId, carolId] }))
    })

    story(
      update,
      given(choosing),
      message(Message.ClickedRemoveStartingMember({ memberId: bobId })),
      Command.expectExact(FocusStartingMembers({})),
      Command.resolve(FocusStartingMembers, Message.CompletedFocusStartingMembers()),
      model((model) => {
        expect(conversationIn(model)).toEqual(Option.some([carolId]))
      }),
      message(Message.ClickedRemoveStartingMember({ memberId: bobId })),
      Command.resolve(FocusStartingMembers, Message.CompletedFocusStartingMembers()),
      model((model) => {
        expect(conversationIn(model)).toEqual(Option.some([carolId]))
      })
    )
  })

  it("open a fresh team form each time, private and with no one added", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedNewTeam()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.TypedTeamName({ name: "Design" })),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      message(Message.ClickedNewTeam()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      model((model) => {
        expect(model.starting).toEqual(Option.some(blankTeam))
      })
    )
  })

  it.effect("write the team to the person's store with its members and visibility, and tell it written", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()

      const result = yield* CreateTeam({
        workspaceId,
        memberId,
        name: "Design review",
        visibility: "Public",
        memberIds: [memberId, bobId]
      }).effect.pipe(Effect.provide(Layer.provide(CreateTeam.layer, layer)))

      expect(written).toEqual([
        {
          action: "TeamCreated",
          payload: { name: "Design review", memberIds: [memberId, bobId], visibility: "Public" }
        }
      ])
      expect(result).toEqual(Message.SucceededCreateTeam())
    })
  )

  it.effect("write nothing, and say why, for a name the host would refuse", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()

      const results = yield* Effect.forEach(["", "  Design", "Design​", "x".repeat(81)], (name) =>
        CreateTeam({ workspaceId, memberId, name, visibility: "Private", memberIds: [memberId] }).effect.pipe(
          Effect.provide(Layer.provide(CreateTeam.layer, layer))
        )
      )

      expect(written).toEqual([])
      expect(results).toEqual(
        results.map(() => Message.FailedCreateTeam({ error: "Use 1 to 80 characters, with no invisible ones." }))
      )
      expect(results).toHaveLength(4)
    })
  )

  it.effect("move focus to the input of the members picker, and complete all the same when it is not there", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const input = yield* Effect.acquireRelease(
          Effect.sync(() => {
            const element = document.createElement("input")
            element.id = inputId(startingMembersId)
            document.body.append(element)
            return element
          }),
          (element) => Effect.sync(() => element.remove())
        )

        const focused = yield* FocusStartingMembers({}).effect.pipe(Effect.provide(FocusStartingMembers.layer))
        expect(document.activeElement).toBe(input)
        expect(focused).toEqual(Message.CompletedFocusStartingMembers())

        input.remove()
        const missing = yield* FocusStartingMembers({}).effect.pipe(Effect.provide(FocusStartingMembers.layer))
        expect(missing).toEqual(Message.CompletedFocusStartingMembers())
      })
    )
  )

  it("start nothing from the New message dialog while no one is chosen", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedNewConversation()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.SubmittedConversation()),
      Command.expectNone(),
      expectNoOutMessage(),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(conversationIn(model)).toEqual(Option.some([]))
      })
    )
  })

  describe("confirming the New message dialog", () => {
    const conversationWithBobAndCarol = {
      ...conversationWithBob,
      id: GroupId.GroupId.make("bob-and-carol"),
      memberIds: [memberId, bobId, carolId]
    }
    const withBobAndCarol = modifyFields(browsing, {
      groups: (groups) => [...groups, { group: conversationWithBobAndCarol, pending: false, members: 3 }]
    })

    /** The dialog open on a conversation with `memberIds` chosen. */
    const choosing = (from: typeof browsing, memberIds: ReadonlyArray<MemberId.MemberId>) =>
      modifyFields(from, {
        starting: () => Option.some(Starting.Conversation({ memberIds })),
        dialog: (dialog) => modifyFields(dialog, { isOpen: () => true })
      })

    it("report the people chosen, to start a conversation with, and close the dialog, when there is none with them", () => {
      story(
        update,
        given(choosing(browsing, [bobId, carolId])),
        message(Message.SubmittedConversation()),
        Command.expectExact(Dialog.test.CloseDialog),
        expectOutMessage(OutMessage.SelectedPeople({ memberIds: [bobId, carolId] })),
        Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
        model((model) => {
          expect(model.starting).toEqual(Option.none())
          expect(model.dialog.isOpen).toBe(false)
          expect(model.selected).toEqual(Option.none())
        })
      )
    })

    it("pick the conversation they have with exactly those people, as a click on its row does, and close the dialog", () => {
      story(
        update,
        given(choosing(withBobAndCarol, [carolId, bobId])),
        message(Message.SubmittedConversation()),
        Command.expectExact(Dialog.test.CloseDialog),
        expectOutMessage(OutMessage.SelectedGroup({ groupId: conversationWithBobAndCarol.id })),
        Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
        model((model) => {
          expect(model.selected).toEqual(Option.some(conversationWithBobAndCarol.id))
          expect(model.starting).toEqual(Option.none())
          expect(model.dialog.isOpen).toBe(false)
        })
      )
    })

    it("find no conversation with some of those people alone or with others besides them", () => {
      story(
        update,
        given(choosing(withBobAndCarol, [carolId])),
        message(Message.SubmittedConversation()),
        Command.expectExact(Dialog.test.CloseDialog),
        expectOutMessage(OutMessage.SelectedPeople({ memberIds: [carolId] })),
        Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
      )
    })

    it("only close the dialog when the conversation they have with those people is the one open already", () => {
      story(
        update,
        given(modifyFields(choosing(browsing, [bobId]), { selected: () => Option.some(conversationWithBob.id) })),
        message(Message.SubmittedConversation()),
        Command.expectExact(Dialog.test.CloseDialog),
        expectNoOutMessage(),
        Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
        model((model) => {
          expect(model.selected).toEqual(Option.some(conversationWithBob.id))
        })
      )
    })
  })

  it("browse the groups they belong to, searching nothing, until the person says otherwise", () => {
    story(
      update,
      given(listed),
      model((model) => {
        expect(model.browse).toEqual({ tab: "Yours", query: "" })
      }),
      message(Message.ChoseBrowseTab({ tab: "Discover" })),
      message(Message.TypedBrowseQuery({ query: "ann" })),
      model((model) => {
        expect(model.browse).toEqual({ tab: "Discover", query: "ann" })
      }),
      message(Message.ChoseBrowseTab({ tab: "Yours" })),
      model((model) => {
        expect(model.browse).toEqual({ tab: "Yours", query: "ann" })
      }),
      expectOutMessage(OutMessage.ChangedBrowseTab())
    )
  })

  it("ask its parent to browse each time the person asks, on the teams to join for Browse groups", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedBrowse()),
      expectOutMessage(OutMessage.RequestedBrowse()),
      model((model) => {
        expect(model).toEqual(modifyFields(listed, { browse: () => ({ tab: "Discover", query: "" }) }))
      }),
      message(Message.ClickedBrowse()),
      expectOutMessage(OutMessage.RequestedBrowse()),
      model((model) => {
        expect(model.browse).toEqual({ tab: "Discover", query: "" })
      })
    )
  })

  it("ask its parent to browse from the Groups title, on the groups the person belongs to, keeping the search", () => {
    story(
      update,
      given(listed),
      message(Message.ChoseBrowseTab({ tab: "Discover" })),
      message(Message.TypedBrowseQuery({ query: "ann" })),
      message(Message.ClickedGroupsTitle()),
      expectOutMessage(OutMessage.RequestedBrowse()),
      model((model) => {
        expect(model.browse).toEqual({ tab: "Yours", query: "ann" })
      })
    )
  })

  it("know the groups are read once they are received, and no sooner", () => {
    story(
      update,
      given(listed),
      model((model) => {
        expect(model.isLoaded).toBe(false)
      }),
      message(Message.ReceivedGroups({ groups: [], members: [], memberships: [], grants: [] })),
      model((model) => {
        expect(model.isLoaded).toBe(true)
        expect(model.groups).toEqual([])
      })
    )
  })

  it("order the teams general first and then by name in any case and whatever the accents, then by ID", () => {
    const named = (id: string, name: string) => ({
      group: { ...design, id: GroupId.GroupId.make(id), name },
      pending: false,
      members: 1
    })
    const items = [
      named("b", "beta"),
      named("a2", "Álvaro"),
      named("a1", "alvaro"),
      named("z", "Zed"),
      named("general", "x")
    ]

    expect(Array.sort(items, byGeneralThenName(listed)).map(({ group }) => group.id)).toEqual([
      "general",
      "a1",
      "a2",
      "b",
      "z"
    ])
  })

  it("order a conversation among the teams by the names of the other members", () => {
    const withMembers = modifyFields(listed, { members: () => [bob] })
    const conversation = { group: conversationWithBob, pending: false, members: 2 }
    const team = (name: string) => ({
      group: { ...design, id: GroupId.GroupId.make(name), name },
      pending: false,
      members: 1
    })

    expect(
      Array.sort([team("Zed"), conversation, team("Alpha"), team("Carol")], byGeneralThenName(withMembers)).map(
        ({ group }) => group.id
      )
    ).toEqual(["Alpha", conversationWithBob.id, "Carol", "Zed"])
  })

  it("list as the person's groups the teams they belong to, and to join the public teams they do not", () => {
    expect(yourTeams(browsing).map(({ group }) => group.id)).toEqual([general.id, design.id])
    expect(discoverable(browsing).map(({ group }) => group.id)).toEqual([launches.id])
  })

  it("join a public team, and report it joined as the team is named, when it is written", () => {
    story(
      update,
      given(browsing),
      message(Message.ClickedJoin({ groupId: launches.id })),
      Command.expectHas(joinLaunches),
      model((model) => {
        expect(model.joining).toEqual([launches.id])
      }),
      Command.resolve(JoinGroup, Message.SucceededJoinGroup({ groupId: launches.id })),
      expectOutMessage(OutMessage.JoinedGroup({ groupId: launches.id, place: "#launches" })),
      model((model) => {
        expect(model.joining).toEqual([])
        expect(model.notice).toEqual(Option.none())
      })
    )
  })

  it("send nothing for a team already being joined", () => {
    story(
      update,
      given(modifyFields(browsing, { joining: () => [launches.id] })),
      message(Message.ClickedJoin({ groupId: launches.id })),
      Command.expectNone(),
      expectNoOutMessage(),
      model((model) => {
        expect(model.joining).toEqual([launches.id])
      })
    )
  })

  it("report nothing joined for a team it can no longer see, which is no longer being joined", () => {
    story(
      update,
      given(modifyFields(listed, { joining: () => [launches.id] })),
      message(Message.SucceededJoinGroup({ groupId: launches.id })),
      expectNoOutMessage(),
      model((model) => {
        expect(model.joining).toEqual([])
      })
    )
  })

  it("say why a join failed, and join again on the next click, which takes the reason away", () => {
    story(
      update,
      given(browsing),
      message(Message.ClickedJoin({ groupId: launches.id })),
      Command.resolve(
        JoinGroup,
        Message.FailedJoinGroup({ groupId: launches.id, error: "This browser could not keep that. Try again." })
      ),
      expectNoOutMessage(),
      model((model) => {
        expect(model.joining).toEqual([])
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
      }),
      message(Message.ClickedJoin({ groupId: launches.id })),
      Command.expectHas(joinLaunches),
      model((model) => {
        expect(model.joining).toEqual([launches.id])
        expect(model.notice).toEqual(Option.none())
      }),
      Command.resolve(JoinGroup, Message.SucceededJoinGroup({ groupId: launches.id })),
      expectOutMessage(OutMessage.JoinedGroup({ groupId: launches.id, place: "#launches" }))
    )
  })

  it("join each public team on its own, so one being joined does not hold up another", () => {
    const ideas = { ...launches, id: GroupId.GroupId.make("ideas"), name: "ideas" }

    story(
      update,
      given(
        modifyFields(browsing, {
          groups: (groups) => [...groups, { group: ideas, pending: false, members: 1 }],
          joining: () => [launches.id]
        })
      ),
      message(Message.ClickedJoin({ groupId: ideas.id })),
      Command.expectHas(JoinGroup({ workspaceId, memberId, groupId: ideas.id })),
      model((model) => {
        expect(model.joining).toEqual([launches.id, ideas.id])
      }),
      Command.resolve(JoinGroup, Message.SucceededJoinGroup({ groupId: ideas.id })),
      model((model) => {
        expect(model.joining).toEqual([launches.id])
      })
    )
  })

  it.effect("write the join of a public team to the person's store, and tell it written", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()

      const result = yield* joinLaunches.effect.pipe(Effect.provide(Layer.provide(JoinGroup.layer, layer)))

      expect(written).toEqual([{ action: "GroupJoined", payload: { groupId: launches.id } }])
      expect(result).toEqual(Message.SucceededJoinGroup({ groupId: launches.id }))
    })
  )

  it("read the groups again each time the person asks to after they could not be, without a reason in the way", () => {
    story(
      update,
      given(listed),
      message(Message.FailedRead({ error: "This browser could not read the groups." })),
      model((model) => {
        expect(model.reads).toBe(0)
        expect(model.notice).toEqual(Option.some("This browser could not read the groups."))
      }),
      message(Message.ClickedTryAgain()),
      expectNoOutMessage(),
      model((model) => {
        expect(model.reads).toBe(1)
        expect(model.notice).toEqual(Option.none())
        expect(model.isLoaded).toBe(false)
      }),
      message(Message.FailedRead({ error: "This browser could not read the groups." })),
      message(Message.ClickedTryAgain()),
      model((model) => {
        expect(model.reads).toBe(2)
      })
    )
  })

  it("drop what the person was starting when the dialog closes, and report the group picked once", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedNewTeam()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(Message.TypedTeamName({ name: "Design" })),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.starting).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      message(Message.ClickedGroup({ groupId })),
      expectOutMessage(OutMessage.SelectedGroup({ groupId })),
      message(Message.ClickedGroup({ groupId })),
      expectNoOutMessage()
    )
  })

  it("pick the conversation of the person and a member alone, as a click on its row does, when there is one", () => {
    const withConversation = modifyFields(listed, {
      groups: () => [
        { group: general, pending: false, members: 2 },
        { group: conversationWithBob, pending: false, members: 2 }
      ]
    })

    story(
      update,
      given(withConversation),
      message(Message.RequestedConversationWith({ memberId: bobId })),
      expectOutMessage(OutMessage.SelectedGroup({ groupId: conversationWithBob.id })),
      model((model) => {
        expect(model.selected).toEqual(Option.some(conversationWithBob.id))
        expect(model.starting).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      message(Message.RequestedConversationWith({ memberId: bobId })),
      expectNoOutMessage(),
      Command.expectNone()
    )
  })

  it("report the member asked for, to open a conversation with them as it will be, when there is none with them alone", () => {
    story(
      update,
      given(listed),
      message(Message.RequestedConversationWith({ memberId: bobId })),
      expectOutMessage(OutMessage.SelectedPeople({ memberIds: [bobId] })),
      Command.expectNone(),
      model((model) => {
        expect(model.starting).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
        expect(model.selected).toEqual(Option.none())
      })
    )
  })

  it("report a teammate the sidebar lists the same way, with no dialog to ask first", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedTeammate({ memberId: bobId })),
      expectOutMessage(OutMessage.SelectedPeople({ memberIds: [bobId] })),
      Command.expectNone(),
      model((model) => {
        expect(model.starting).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
        expect(model.selected).toEqual(Option.none())
      })
    )
  })

  it("open the conversation instead when one with the teammate has appeared since the sidebar listed them", () => {
    const withConversation = modifyFields(listed, {
      groups: () => [
        { group: general, pending: false, members: 2 },
        { group: conversationWithBob, pending: false, members: 2 }
      ]
    })

    story(
      update,
      given(withConversation),
      message(Message.ClickedTeammate({ memberId: bobId })),
      expectOutMessage(OutMessage.SelectedGroup({ groupId: conversationWithBob.id })),
      Command.expectNone(),
      model((model) => {
        expect(model.selected).toEqual(Option.some(conversationWithBob.id))
        expect(model.starting).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      })
    )
  })

  describe("reading what a group's row says", () => {
    const firstAt = DateTime.makeUnsafe("2026-10-18T12:10:00Z")
    const laterAt = DateTime.makeUnsafe("2026-10-18T12:20:00Z")
    const unread = { groupId: general.id, latestAt: firstAt }
    const markGeneralRead = MarkGroupRead({ workspaceId, memberId, groupId: general.id })
    const inGeneral = modifyFields(browsing, { selected: () => Option.some(general.id) })

    it("keep what is unread, what waits, the turns under way, and the agents, as the store reports them", () => {
      const turn = turnOf("turn-1", "running")

      story(
        update,
        given(browsing),
        message(
          Message.ReceivedSignals({
            newActivity: [unread],
            waiting: [{ groupId: design.id, count: 2 }],
            turns: [turn],
            agents: [{ agent: scoutAgent, pending: false }]
          })
        ),
        Command.expectNone(),
        model((model) => {
          expect(model.newActivity).toEqual([unread])
          expect(model.waiting).toEqual([{ groupId: design.id, count: 2 }])
          expect(model.turns).toEqual([turn])
          expect(model.agents).toEqual([{ agent: scoutAgent, pending: false }])
          expect(hasNewActivityIn(model, general.id)).toBe(true)
          expect(hasNewActivityIn(model, design.id)).toBe(false)
          expect(waitingIn(model, design.id)).toBe(2)
          expect(waitingIn(model, general.id)).toBe(0)
        }),
        message(Message.ReceivedSignals({ newActivity: [], waiting: [], turns: [], agents: [] })),
        model((model) => {
          expect(hasNewActivityIn(model, general.id)).toBe(false)
          expect(waitingIn(model, design.id)).toBe(0)
        })
      )
    })

    it("ask to mark the group open as read once it has activity the person has not read, and ask again only for later activity", () => {
      story(
        update,
        given(inGeneral),
        message(Message.ReceivedSignals({ newActivity: [], waiting: [], turns: [], agents: [] })),
        Command.expectNone(),
        message(Message.ReceivedSignals({ newActivity: [unread], waiting: [], turns: [], agents: [] })),
        Command.expectExact(markGeneralRead),
        Command.resolve(MarkGroupRead, Message.WroteAction()),
        model((model) => {
          expect(model.readRequested).toEqual(Option.some(unread))
        }),
        message(Message.ReceivedSignals({ newActivity: [unread], waiting: [], turns: [], agents: [] })),
        Command.expectNone(),
        message(Message.ReceivedSignals({ newActivity: [], waiting: [], turns: [], agents: [] })),
        Command.expectNone(),
        message(
          Message.ReceivedSignals({
            newActivity: [{ ...unread, latestAt: laterAt }],
            waiting: [],
            turns: [],
            agents: []
          })
        ),
        Command.expectExact(markGeneralRead),
        Command.resolve(MarkGroupRead, Message.WroteAction()),
        model((model) => {
          expect(model.readRequested).toEqual(Option.some({ ...unread, latestAt: laterAt }))
        })
      )
    })

    it("ask to mark nothing read for a group that is not the one open", () => {
      story(
        update,
        given(browsing),
        message(Message.ReceivedSignals({ newActivity: [unread], waiting: [], turns: [], agents: [] })),
        Command.expectNone(),
        model((model) => {
          expect(model.readRequested).toEqual(Option.none())
        }),
        message(
          Message.ReceivedSignals({
            newActivity: [{ ...unread, groupId: design.id }],
            waiting: [],
            turns: [],
            agents: []
          })
        ),
        Command.expectNone()
      )
      story(
        update,
        given(modifyFields(browsing, { selected: () => Option.some(design.id) })),
        message(Message.ReceivedSignals({ newActivity: [unread], waiting: [], turns: [], agents: [] })),
        Command.expectNone()
      )
    })

    it("mark a group read as the person picks it, once, and report it picked", () => {
      story(
        update,
        given(modifyFields(browsing, { newActivity: () => [unread] })),
        message(Message.ClickedGroup({ groupId: general.id })),
        expectOutMessage(OutMessage.SelectedGroup({ groupId: general.id })),
        Command.expectExact(markGeneralRead),
        Command.resolve(MarkGroupRead, Message.WroteAction()),
        model((model) => {
          expect(model.selected).toEqual(Option.some(general.id))
          expect(model.readRequested).toEqual(Option.some(unread))
        }),
        message(Message.ClickedGroup({ groupId: general.id })),
        Command.expectNone(),
        expectNoOutMessage()
      )
    })

    it("mark no group read as the person picks one that has nothing unread", () => {
      story(
        update,
        given(modifyFields(browsing, { newActivity: () => [unread] })),
        message(Message.ClickedGroup({ groupId: design.id })),
        Command.expectNone(),
        expectOutMessage(OutMessage.SelectedGroup({ groupId: design.id }))
      )
    })

    it("mark a group read as its parent opens it, and not as the parent leaves it", () => {
      story(
        update,
        given(modifyFields(browsing, { newActivity: () => [unread] })),
        message(Message.InformedOfOpenGroup({ groupId: Option.some(general.id) })),
        Command.expectExact(markGeneralRead),
        Command.resolve(MarkGroupRead, Message.WroteAction()),
        message(Message.InformedOfOpenGroup({ groupId: Option.none() })),
        Command.expectNone(),
        model((model) => {
          expect(model.selected).toEqual(Option.none())
        })
      )
    })

    it.effect("write the group read to the person's store, and tell it written", () =>
      Effect.gen(function* () {
        const { written, layer } = recordingStores()

        const result = yield* markGeneralRead.effect.pipe(Effect.provide(Layer.provide(MarkGroupRead.layer, layer)))

        expect(written).toEqual([{ action: "GroupMarkedRead", payload: { groupId: general.id } }])
        expect(result).toEqual(Message.WroteAction())
      })
    )
  })

  it("find the conversation of the person with exactly the members given, in any order, and no other that holds them", () => {
    const withCarol = { ...conversationWithBob, id: GroupId.GroupId.make("with-carol"), memberIds: [memberId, carolId] }
    const withBobAndCarol = {
      ...conversationWithBob,
      id: GroupId.GroupId.make("bob-and-carol"),
      memberIds: [memberId, bobId, carolId]
    }
    const among = modifyFields(listed, {
      groups: () => [
        {
          group: {
            ...conversationWithBob,
            id: GroupId.GroupId.make("without-the-person"),
            memberIds: [bobId, carolId]
          },
          pending: false,
          members: 2
        },
        { group: withBobAndCarol, pending: false, members: 3 },
        { group: withCarol, pending: false, members: 2 },
        { group: conversationWithBob, pending: true, members: 2 }
      ]
    })

    expect(Option.map(conversationWith(among, [bobId]), ({ id }) => id)).toEqual(Option.some(conversationWithBob.id))
    expect(Option.map(conversationWith(among, [carolId]), ({ id }) => id)).toEqual(Option.some(withCarol.id))
    expect(Option.map(conversationWith(among, [bobId, carolId]), ({ id }) => id)).toEqual(
      Option.some(withBobAndCarol.id)
    )
    expect(Option.map(conversationWith(among, [carolId, bobId]), ({ id }) => id)).toEqual(
      Option.some(withBobAndCarol.id)
    )
    expect(conversationWith(among, [MemberId.MemberId.make("member-4")])).toEqual(Option.none())
    expect(conversationWith(among, [bobId, MemberId.MemberId.make("member-4")])).toEqual(Option.none())
    expect(conversationWith(listed, [bobId])).toEqual(Option.none())
  })
})
