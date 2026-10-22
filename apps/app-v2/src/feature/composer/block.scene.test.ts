import { describe, expectTypeOf, it } from "@effect/vitest"
import * as Button from "@foldkit/ui/button"
import * as Textarea from "@foldkit/ui/textarea"
import { Option, Schema } from "effect"
import { Block } from "foldkit"
import {
  Command,
  click,
  expect,
  expectHandled,
  expectIgnored,
  expectOutMessage,
  given,
  keydown,
  role,
  scene,
  selector,
  type
} from "foldkit/scene"
import { bob, membership, thread } from "../../../test/fixtures.ts"
import * as Drafts from "../../store/Drafts.ts"
import { ComposerBlock } from "./block.ts"
import { SaveDraft } from "./command.ts"
import { boxId, Message, OutMessage } from "./definition.ts"
import { type ViewInputs, view } from "./view/main.ts"

/** A consumer supplies native HTML and headless controls without changing the composer's behavior. */
const plainView = ComposerBlock.makeView.withInputs<ViewInputs>((model, { placeholder }, h) => {
  const value = Option.getOrElse(model.text, () => "")
  return h.form(
    [h.AriaLabel(placeholder), h.OnSubmit(Message.SubmittedText())],
    [
      Textarea.view(
        {
          id: boxId(model.place),
          value,
          onInput: (text) => Message.TypedText({ text }),
          toView: (attributes) =>
            h.div(
              [],
              [
                h.label(attributes.label, [placeholder]),
                h.textarea([
                  ...attributes.textarea,
                  h.OnKeyDownPreventDefault((key, { ctrlKey, metaKey, shiftKey, altKey }) =>
                    key === "Enter" && !ctrlKey && !metaKey && !shiftKey && !altKey
                      ? Option.some(Message.SubmittedText())
                      : Option.none()
                  )
                ])
              ]
            )
        },
        h
      ),
      Button.view(
        {
          type: "submit",
          isDisabled: value.trim() === "",
          toView: (attributes) => h.button(attributes.button, ["Send"])
        },
        h
      )
    ]
  )
})

const HostDefinition = Block.makeDefinition("ComposerConsumer", {
  Model: Schema.Struct({ composer: ComposerBlock.Model }),
  Message: Schema.Never,
  OutMessage: ComposerBlock.OutMessage
})
const ComposerBinding = HostDefinition.bindChild(ComposerBlock, {
  field: "composer",
  init: false,
  outMessage: { forward: (message) => message }
})
const HostComposition = HostDefinition.makeComposition({ bindings: [ComposerBinding] })
const update = HostComposition.makeUpdate()
const place = Drafts.Place.cases.Reply.make({ threadId: thread.id })
const empty = {
  composer: ComposerBlock.init(membership.workspace.id, membership.member.id, place).model
}
const inputs: ViewInputs = { placeholder: "Reply in thread", members: [membership.member, bob] }
const hostView = (renderer: typeof view) =>
  HostComposition.makeView((model, h) =>
    h.block(
      ComposerBinding.embedView({ slotId: "composer", model: model.composer, view: renderer, viewInputs: inputs })
    )
  )
const saveDraft = (text: string) =>
  SaveDraft({ workspaceId: membership.workspace.id, memberId: membership.member.id, place, text })

describe("a composer with an explicit view", () => {
  for (const [name, renderer] of [
    ["plain", plainView],
    ["Amends", view]
  ] as const) {
    it(`keeps and sends the same draft through the ${name} view`, () => {
      scene(
        { update, view: hostView(renderer) },
        given(empty),
        expect(role("button", { name: "Send" })).toBeDisabled(),
        type(role("textbox", { name: inputs.placeholder }), "A reply"),
        Command.expectExact(saveDraft("A reply")),
        Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
        click(role("button", { name: "Send" })),
        expectOutMessage(OutMessage.SubmittedText({ text: "A reply" })),
        Command.expectExact(saveDraft("")),
        Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
        expect(role("textbox", { name: inputs.placeholder })).toHaveValue("")
      )
    })

    it(`leaves Shift+Enter to the browser and sends on Enter through the ${name} view`, () => {
      scene(
        { update, view: hostView(renderer) },
        given({ composer: { ...empty.composer, text: Option.some("A saved reply") } }),
        keydown(role("textbox", { name: inputs.placeholder }), "Enter", { shiftKey: true }),
        expectIgnored(),
        expect(role("textbox", { name: inputs.placeholder })).toHaveValue("A saved reply"),
        keydown(role("textbox", { name: inputs.placeholder }), "Enter"),
        expectHandled(),
        expectOutMessage(OutMessage.SubmittedText({ text: "A saved reply" })),
        Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
        expect(role("textbox", { name: inputs.placeholder })).toHaveValue("")
      )
    })
  }

  it("renders the plain view without classes or inline styles", () => {
    scene(
      { update, view: hostView(plainView) },
      given(empty),
      expect(role("textbox", { name: inputs.placeholder })).toExist(),
      expect(selector("[class]")).toBeAbsent(),
      expect(selector("[style]")).toBeAbsent()
    )
  })
  it("requires its consumer to select a view at the typed boundary", () => {
    expectTypeOf(() => {
      // @ts-expect-error A behavior-only composer requires its consumer to select a view.
      ComposerBinding.embedView({ slotId: "composer", model: empty.composer })
    }).toEqualTypeOf<() => void>()
  })
})
