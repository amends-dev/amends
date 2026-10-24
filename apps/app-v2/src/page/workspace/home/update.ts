import { isAsideInDialog } from "@amends-dev/design/shell"
import type { Viewport } from "@amends-dev/design/viewport"
import * as Update from "foldkit/update"
import {
  dismissOverlays,
  GroupsBinding,
  HomeComposition,
  hideAside,
  markAndOpenGroup,
  openThreadInGroup,
  showAside,
  showDestination,
  showInbox,
  showTasks,
  showTriage,
  switchTo
} from "./composition.ts"
import { HomeDefinition, isThreadOpen, Message, OutMessage } from "./definition.ts"

/** Lay Home out for a window of the width `viewport`. */
const showViewport = (viewport: Viewport) => HomeDefinition.makeFieldsStep(() => ({ viewport: () => viewport }))

/**
 * Put the thread open, if there is one, where the window's width puts the side pane: in its dialog, which opens, or
 * beside the main pane, which closes the dialog without closing the thread.
 */
const placeAside = HomeDefinition.makeStep((model) => {
  if (!isThreadOpen(model)) {
    return HomeDefinition.makeNoopStep()
  }

  if (isAsideInDialog(model.viewport)) {
    return showAside
  }

  return hideAside
})

export const update = HomeComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedInbox: () =>
      Update.withOutMessage(Update.combineSteps(model, [switchTo(showInbox)]), OutMessage.Navigated()),
    ClickedTriage: () =>
      Update.withOutMessage(Update.combineSteps(model, [switchTo(showTriage)]), OutMessage.Navigated()),
    ClickedTasks: () =>
      Update.withOutMessage(Update.combineSteps(model, [switchTo(showTasks)]), OutMessage.Navigated()),
    RequestedDestination: ({ destination }) => Update.combineSteps(model, [showDestination(destination)]),
    RequestedDismiss: () => Update.combineSteps(model, [dismissOverlays]),
    RequestedReset: () => Update.combineSteps(model, [switchTo(showInbox)]),
    RequestedOpenGroup: ({ groupId }) => Update.combineSteps(model, [markAndOpenGroup(groupId)]),
    RequestedOpenThread: ({ groupId, threadId }) => Update.combineSteps(model, [openThreadInGroup(groupId, threadId)]),
    // NOTE: The operation's own result, not one passed through Update.combineSteps, which keeps no OutMessage and would lose
    // the Navigated that the groups' policy forwards when a conversation is selected.
    RequestedConversationWith: ({ memberId }) => GroupsBinding.requestConversationWith({ memberId })(model),
    InformedOfViewport: ({ viewport }) => Update.combineSteps(model, [showViewport(viewport), placeAside])
  })
)
