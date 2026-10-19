import { ApplicationComposition } from "./composition.ts"

export const init = ApplicationComposition.makeInit(() => ({
  model: {
    workspaceName: "",
    fullName: "Ada Lovelace",
    email: "ada@",
    signInEmail: "",
    code: "",
    notes: "",
    composer: "",
    reply: "",
    draft: "",
    filledDraft: "Reproduced on both. Filing it now, and tagging the composer team.",
    editText: "Reproduced on both, images over 5 MB hit the crash.",
    openThread: "composer-paste-crash",
    destination: "home",
    paneTab: "threads",
    isNotificationsOn: true,
    isDigestOn: false,
    plan: "team",
    taskStatus: "triage",
    taskPriority: "none",
    taskAssignee: "",
    pressCount: 0
  }
}))
