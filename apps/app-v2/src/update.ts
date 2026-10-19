import * as Update from "foldkit/update"
import { ApplicationComposition, signOut } from "./composition.ts"
import { Message } from "./message.ts"

export const update = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedSignOut: () => Update.combine(model, [signOut]),
    CompletedSignOut: () => ({ model })
  })
)
