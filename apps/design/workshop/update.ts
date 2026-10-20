import * as Match from "effect/Match"
import { modifyFields } from "foldkit/struct"
import {
  ApplicationComposition,
  AddViewModalBinding,
  ChooserModalBinding,
  CompactModalBinding,
  ConfirmModalBinding,
  CreateModalBinding,
  ModalBinding,
  WideModalBinding
} from "./composition.ts"
import { Message, type MemberPlace, type Model } from "./definition.ts"

/** The model without the person `id` among the people the picker of `place` holds. */
const withoutMember = (model: Model, place: MemberPlace, id: string) => {
  const remove = (members: ReadonlyArray<string>) => members.filter((member) => member !== id)

  return Match.value(place).pipe(
    Match.when("empty", () => modifyFields(model, { emptyMembers: remove })),
    Match.when("chosen", () => modifyFields(model, { chosenMembers: remove })),
    Match.when("create", () => modifyFields(model, { createMembers: remove })),
    Match.when("add", () => modifyFields(model, { addMembers: remove })),
    Match.when("list", () => modifyFields(model, { listMembers: remove })),
    Match.exhaustive
  )
}

export const update = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedButton: () => ({ model: modifyFields(model, { pressCount: (pressCount) => pressCount + 1 }) }),
    TypedWorkspaceName: ({ value }) => ({ model: modifyFields(model, { workspaceName: () => value }) }),
    TypedFullName: ({ value }) => ({ model: modifyFields(model, { fullName: () => value }) }),
    TypedEmail: ({ value }) => ({ model: modifyFields(model, { email: () => value }) }),
    TypedSignInEmail: ({ value }) => ({ model: modifyFields(model, { signInEmail: () => value }) }),
    TypedCode: ({ value }) => ({ model: modifyFields(model, { code: () => value }) }),
    TypedNotes: ({ value }) => ({ model: modifyFields(model, { notes: () => value }) }),
    TypedAgentQuery: ({ value }) => ({ model: modifyFields(model, { agentQuery: () => value }) }),
    TypedTaskQuery: ({ value }) => ({ model: modifyFields(model, { taskQuery: () => value }) }),
    TypedComposer: ({ value }) => ({ model: modifyFields(model, { composer: () => value }) }),
    TypedReply: ({ value }) => ({ model: modifyFields(model, { reply: () => value }) }),
    TypedDraft: ({ value }) => ({ model: modifyFields(model, { draft: () => value }) }),
    TypedFilledDraft: ({ value }) => ({ model: modifyFields(model, { filledDraft: () => value }) }),
    TypedEdit: ({ value }) => ({ model: modifyFields(model, { editText: () => value }) }),
    TypedGroupName: ({ value }) => ({ model: modifyFields(model, { groupName: () => value }) }),
    TypedNewGroupName: ({ value }) => ({ model: modifyFields(model, { newGroupName: () => value }) }),
    OpenedThread: ({ key }) => ({ model: modifyFields(model, { openThread: () => key }) }),
    ChangedDestination: ({ destination }) => ({ model: modifyFields(model, { destination: () => destination }) }),
    ChangedPaneTab: ({ tab }) => ({ model: modifyFields(model, { paneTab: () => tab }) }),
    ToggledNotifications: ({ isOn }) => ({ model: modifyFields(model, { isNotificationsOn: () => isOn }) }),
    ToggledDigest: ({ isOn }) => ({ model: modifyFields(model, { isDigestOn: () => isOn }) }),
    ToggledGroupPrivate: ({ isOn }) => ({ model: modifyFields(model, { isGroupPrivate: () => isOn }) }),
    ToggledNameSending: ({ isOn }) => ({ model: modifyFields(model, { isNameSending: () => isOn }) }),
    ClickedOpenModal: () => ModalBinding.requestOpen()(model),
    ClickedOpenWideModal: () => WideModalBinding.requestOpen()(model),
    ClickedOpenChooserModal: () => ChooserModalBinding.requestOpen()(model),
    ClickedOpenConfirmModal: () => ConfirmModalBinding.requestOpen()(model),
    ClickedOpenCompactModal: () => CompactModalBinding.requestOpen()(model),
    ClickedOpenCreateModal: () => CreateModalBinding.requestOpen()(model),
    ClickedOpenAddViewModal: () => AddViewModalBinding.requestOpen()(model),
    ClickedCloseAddViewModal: () => AddViewModalBinding.requestClose()(model),
    TypedMemberListQuery: ({ value }) => ({ model: modifyFields(model, { listQuery: () => value }) }),
    PickedListMember: ({ id }) => ({
      model: modifyFields(model, { listMembers: (members) => [...members, id], listQuery: () => "" })
    }),
    ClickedRemoveMember: ({ place, id }) => ({ model: withoutMember(model, place, id) }),
    ClickedAddMembers: () => ({
      model: modifyFields(model, {
        heldMembers: (held) => [...held, ...model.addMembers],
        addMembers: () => []
      })
    }),
    ClickedRemoveHeldMember: ({ id }) => ({
      model: modifyFields(model, { heldMembers: (held) => held.filter((member) => member !== id) })
    }),
    TypedIntegrationQuery: ({ value }) => ({ model: modifyFields(model, { integrationQuery: () => value }) }),
    PickedIntegration: () => ChooserModalBinding.requestClose()(model),
    ChangedModalTab: ({ tab }) => ({ model: modifyFields(model, { modalTab: () => tab }) }),
    SubmittedModal: () => ModalBinding.requestClose()(model),
    SubmittedWideModal: () => WideModalBinding.requestClose()(model),
    SubmittedConfirmModal: () => ConfirmModalBinding.requestClose()(model),
    SubmittedCompactModal: () => CompactModalBinding.requestClose()(model),
    SubmittedCreateModal: () => CreateModalBinding.requestClose()(model),
    SubmittedAddViewModal: () => AddViewModalBinding.requestClose()(model),
    ChangedPlan: ({ plan }) => ({ model: modifyFields(model, { plan: () => plan }) }),
    ChangedTaskStatus: ({ status }) => ({ model: modifyFields(model, { taskStatus: () => status }) }),
    ChangedTaskPriority: ({ priority }) => ({ model: modifyFields(model, { taskPriority: () => priority }) }),
    ChangedTaskAssignee: ({ assignee }) => ({ model: modifyFields(model, { taskAssignee: () => assignee }) })
  })
)
