import { modifyFields } from "foldkit/struct"
import { ApplicationComposition, ChooserModalBinding, ModalBinding, WideModalBinding } from "./composition.ts"
import { Message } from "./definition.ts"

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
    TypedComposer: ({ value }) => ({ model: modifyFields(model, { composer: () => value }) }),
    TypedReply: ({ value }) => ({ model: modifyFields(model, { reply: () => value }) }),
    TypedDraft: ({ value }) => ({ model: modifyFields(model, { draft: () => value }) }),
    TypedFilledDraft: ({ value }) => ({ model: modifyFields(model, { filledDraft: () => value }) }),
    TypedEdit: ({ value }) => ({ model: modifyFields(model, { editText: () => value }) }),
    TypedGroupName: ({ value }) => ({ model: modifyFields(model, { groupName: () => value }) }),
    OpenedThread: ({ key }) => ({ model: modifyFields(model, { openThread: () => key }) }),
    ChangedDestination: ({ destination }) => ({ model: modifyFields(model, { destination: () => destination }) }),
    ChangedPaneTab: ({ tab }) => ({ model: modifyFields(model, { paneTab: () => tab }) }),
    ToggledNotifications: ({ isOn }) => ({ model: modifyFields(model, { isNotificationsOn: () => isOn }) }),
    ToggledDigest: ({ isOn }) => ({ model: modifyFields(model, { isDigestOn: () => isOn }) }),
    ToggledGroupPrivate: ({ isOn }) => ({ model: modifyFields(model, { isGroupPrivate: () => isOn }) }),
    ClickedOpenModal: () => ModalBinding.requestOpen()(model),
    ClickedOpenWideModal: () => WideModalBinding.requestOpen()(model),
    ClickedOpenChooserModal: () => ChooserModalBinding.requestOpen()(model),
    TypedIntegrationQuery: ({ value }) => ({ model: modifyFields(model, { integrationQuery: () => value }) }),
    PickedIntegration: () => ChooserModalBinding.requestClose()(model),
    ChangedModalTab: ({ tab }) => ({ model: modifyFields(model, { modalTab: () => tab }) }),
    SubmittedModal: () => ModalBinding.requestClose()(model),
    SubmittedWideModal: () => WideModalBinding.requestClose()(model),
    ChangedPlan: ({ plan }) => ({ model: modifyFields(model, { plan: () => plan }) }),
    ChangedTaskStatus: ({ status }) => ({ model: modifyFields(model, { taskStatus: () => status }) }),
    ChangedTaskPriority: ({ priority }) => ({ model: modifyFields(model, { taskPriority: () => priority }) }),
    ChangedTaskAssignee: ({ assignee }) => ({ model: modifyFields(model, { taskAssignee: () => assignee }) })
  })
)
