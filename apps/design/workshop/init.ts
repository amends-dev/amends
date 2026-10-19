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
    destination: "home",
    paneTab: "threads",
    isNotificationsOn: true,
    isDigestOn: false,
    plan: "team",
    pressCount: 0
  }
}))
