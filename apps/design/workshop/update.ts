import { modifyFields } from "foldkit/struct"
import { ApplicationComposition } from "./composition.ts"
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
    TypedComposer: ({ value }) => ({ model: modifyFields(model, { composer: () => value }) }),
    TypedReply: ({ value }) => ({ model: modifyFields(model, { reply: () => value }) }),
    ChangedDestination: ({ destination }) => ({ model: modifyFields(model, { destination: () => destination }) }),
    ChangedPaneTab: ({ tab }) => ({ model: modifyFields(model, { paneTab: () => tab }) }),
    ToggledNotifications: ({ isOn }) => ({ model: modifyFields(model, { isNotificationsOn: () => isOn }) }),
    ToggledDigest: ({ isOn }) => ({ model: modifyFields(model, { isDigestOn: () => isOn }) }),
    ChangedPlan: ({ plan }) => ({ model: modifyFields(model, { plan: () => plan }) })
  })
)
