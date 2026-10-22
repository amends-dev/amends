import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import type * as Drafts from "../../store/Drafts.ts"
import { ReadDraft } from "./command.ts"
import { ComposerComposition, Model } from "./definition.ts"

/** A composer at `place`, reading its draft. */
export const init = ComposerComposition.makeInit(
  (workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, place: Drafts.Place) => ({
    model: Model.make({
      workspaceId,
      memberId,
      place,
      text: Option.none(),
      mentions: [],
      picking: Option.none(),
      formattingChoice: Option.none(),
      viewport: "Desktop"
    }),
    commands: [ReadDraft({ workspaceId, memberId, place })]
  })
)
