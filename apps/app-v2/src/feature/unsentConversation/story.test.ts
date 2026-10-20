import { GroupId } from "@amends-dev/core/group"
import { ThreadMessage } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { bob, membership, scout } from "../../../test/fixtures.ts"
import { recordingStores } from "../../../test/recordingStores.ts"
import * as Drafts from "../../store/Drafts.ts"
import { ComposerBlock } from "../composer/block.ts"
import { SaveDraft } from "../composer/command.ts"
import { StartConversation } from "./command.ts"
import { ComposerBinding } from "./composition.ts"
import { Message, nameOf, OutMessage, soleMemberId } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const bobId = MemberId.MemberId.make("member-2")
const scoutId = MemberId.MemberId.make("member-3")

const place = Drafts.Place.cases.Conversation.make({ memberIds: [bobId] })

const withBob = init(workspaceId, memberId, [bobId], [])

const unstarted = withBob.model

/** The composer reporting what the person did in it, as the conversation receives it. */
const fromComposer = (message: typeof ComposerBlock.Message.Type) =>
  ComposerBinding.embedView({
    slotId: "composer",
    model: unstarted.composer,
    viewInputs: { placeholder: "Message Bob", members: [] }
  }).toParentMessage(message)

describe("a conversation not started", () => {
  it("is with the people it is given, has nothing written, and reads the draft of its first message", () => {
    expect(unstarted).toMatchObject({ workspaceId, memberId, memberIds: [bobId], members: [], notice: Option.none() })
    expect(withBob.commands).toHaveLength(1)
  })

  it("is named by its people as a conversation with them is, by their IDs until the members are read", () => {
    const withSeveral = init(workspaceId, memberId, [bobId, scoutId], []).model

    expect(nameOf(unstarted)).toBe("member-2")
    expect(nameOf(withSeveral)).toBe("member-2, member-3")

    story(
      update,
      given(withSeveral),
      message(Message.ReceivedMembers({ members: [membership.member, bob, scout] })),
      model((model) => {
        expect(nameOf(model)).toBe("Bob, Scout")
      })
    )
  })

  it("is with one person alone, or with several", () => {
    expect(soleMemberId(unstarted)).toEqual(Option.some(bobId))
    expect(soleMemberId(init(workspaceId, memberId, [bobId, scoutId], []).model)).toEqual(Option.none())
  })

  it("starts the conversation with what the person wrote, once, and says why it could not be kept", () => {
    story(
      update,
      given(unstarted),
      message(fromComposer(ComposerBlock.Message.ReceivedDraft({ text: "Got a minute?" }))),
      message(fromComposer(ComposerBlock.Message.SubmittedText())),
      Command.expectExact(
        SaveDraft({ workspaceId, memberId, place, text: "" }),
        StartConversation({ workspaceId, memberId, memberIds: [bobId], text: "Got a minute?" })
      ),
      expectNoOutMessage(),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(
        StartConversation,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
        expect(model.composer.text).toEqual(Option.some(""))
      }),
      message(fromComposer(ComposerBlock.Message.ReceivedDraft({ text: "" }))),
      message(fromComposer(ComposerBlock.Message.TypedText({ text: "Again" }))),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      message(fromComposer(ComposerBlock.Message.SubmittedText())),
      Command.expectExact(
        SaveDraft({ workspaceId, memberId, place, text: "" }),
        StartConversation({ workspaceId, memberId, memberIds: [bobId], text: "Again" })
      ),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(StartConversation, Message.WroteAction()),
      model((model) => {
        expect(model.notice).toEqual(Option.none())
      })
    )
  })

  it("starts nothing for a message of nothing but spaces, and while the person is only typing", () => {
    story(
      update,
      given(unstarted),
      message(fromComposer(ComposerBlock.Message.ReceivedDraft({ text: "  " }))),
      message(fromComposer(ComposerBlock.Message.SubmittedText())),
      Command.expectNone(),
      message(fromComposer(ComposerBlock.Message.TypedText({ text: "Hel" }))),
      Command.expectExact(SaveDraft({ workspaceId, memberId, place, text: "Hel" })),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft())
    )
  })

  it("reports the conversation once the store lists one with exactly these people, and not before", () => {
    const found = GroupId.GroupId.make("direct-1")

    story(
      update,
      given(unstarted),
      message(Message.ReceivedConversation({ groupId: Option.none() })),
      expectNoOutMessage(),
      message(Message.ReceivedConversation({ groupId: Option.some(found) })),
      expectOutMessage(OutMessage.FoundConversation({ groupId: found }))
    )
  })

  it("says why the workspace could not be read", () => {
    story(
      update,
      given(unstarted),
      message(Message.FailedRead({ error: "This browser could not read the workspace's copy." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not read the workspace's copy."))
      })
    )
  })

  it.effect("writes the conversation with its people and the members its first message mentions", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()
      const start = (memberIds: ReadonlyArray<MemberId.MemberId>, text: string) =>
        StartConversation({ workspaceId, memberId, memberIds, text }).effect.pipe(
          Effect.provide(Layer.provide(StartConversation.layer, layer))
        )
      const text = `${ThreadMessage.mentionText(bobId, "Bob")} got a minute?`

      const first = yield* start([bobId], text)
      yield* start([bobId, scoutId], "Got a minute?")

      expect(first).toEqual(Message.WroteAction())
      expect(written).toEqual([
        { action: "DirectThreadStarted", payload: { memberIds: [bobId], text, mentions: [bobId] } },
        {
          action: "DirectThreadStarted",
          payload: { memberIds: [bobId, scoutId], text: "Got a minute?", mentions: [] }
        }
      ])
    })
  )

  it.effect("writes nothing, and says why, for a first message of nothing", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()

      const result = yield* StartConversation({ workspaceId, memberId, memberIds: [bobId], text: "" }).effect.pipe(
        Effect.provide(Layer.provide(StartConversation.layer, layer))
      )

      expect(written).toEqual([])
      expect(result).toEqual(Message.FailedWriteAction({ error: "A conversation needs a first message." }))
    })
  )

  it.effect("says the action could not be kept when the store refuses it", () =>
    Effect.gen(function* () {
      const { layer } = recordingStores(0)

      const result = yield* StartConversation({ workspaceId, memberId, memberIds: [bobId], text: "Hi" }).effect.pipe(
        Effect.provide(Layer.provide(StartConversation.layer, layer))
      )

      expect(result).toEqual(Message.FailedWriteAction({ error: "This browser could not keep that. Try again." }))
    })
  )
})
