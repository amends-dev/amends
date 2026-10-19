import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { GroupsComposition } from "./composition.ts"
import { Message, OutMessage } from "./definition.ts"

export const update = GroupsComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedGroups: ({ groups }) => ({ model: modifyFields(model, { groups: () => groups }) }),
    ReceivedMembers: ({ members }) => ({ model: modifyFields(model, { members: () => members }) }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    // Picking the group already picked changes nothing.
    ClickedGroup: ({ groupId }) =>
      Option.contains(model.selected, groupId)
        ? { model }
        : {
            model: modifyFields(model, { selected: () => Option.some(groupId) }),
            outMessage: OutMessage.SelectedGroup({ groupId })
          }
  })
)
