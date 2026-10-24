/**
 * Boot the app in the page's `#root`, from the session kept from the last visit and the window's width.
 */

import { Program, Runtime } from "foldkit"
import { ApplicationBlock } from "./block.ts"
import { Flags, flags } from "./flags.ts"
import { ApplicationLayer } from "./services.ts"
import { crashView } from "./view/crash.ts"

const program = Program.make({
  block: ApplicationBlock,
  Flags,
  container: document.getElementById("root"),
  routing: {
    onUrlRequest: ApplicationBlock.Message.ClickedLink,
    onUrlChange: ApplicationBlock.Message.ChangedUrl
  },
  crash: { view: crashView },
  devTools: { dispatch: true }
})

Runtime.run(program.provide(ApplicationLayer), { flags })
