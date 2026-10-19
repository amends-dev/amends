import { ApplicationComposition } from "./composition.ts"

export const init = ApplicationComposition.makeInit(() => ({
  model: {
    workspaceName: "",
    fullName: "Ada Lovelace",
    email: "ada@",
    signInEmail: "",
    code: "",
    notes: "",
    isNotificationsOn: true,
    isDigestOn: false,
    plan: "team",
    pressCount: 0
  }
}))
