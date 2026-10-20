import { ApplicationComposition } from "./composition.ts"

export const init = ApplicationComposition.makeInit(() => ({
  model: {
    workspaceName: "",
    fullName: "Ada Lovelace",
    email: "ada@",
    signInEmail: "",
    code: "",
    notes: "",
    agentQuery: "",
    composer: "",
    reply: "",
    draft: "",
    filledDraft: "Reproduced on both. Filing it now, and tagging the composer team.",
    editText: "Reproduced on both, images over 5 MB hit the crash.",
    groupName: "general",
    openThread: "composer-paste-crash",
    destination: "home",
    paneTab: "threads",
    isNotificationsOn: true,
    isDigestOn: false,
    isGroupPrivate: false,
    modalTab: "general",
    integrationQuery: "",
    plan: "team",
    taskStatus: "triage",
    taskPriority: "none",
    taskAssignee: "",
    pressCount: 0
  }
}))
