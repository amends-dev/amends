import type { Invitation, Workspace, WorkspaceId } from "@amends-dev/core/workspace"
import type * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { AcceptInvitation, CreateWorkspace, ExpireToast, FocusWorkspaceRow, LoadWorkspaces } from "./command.ts"
import { DialogBinding, leaveEntering, WorkspacesComposition } from "./composition.ts"
import {
  Entering,
  hasWorkspaceName,
  Message,
  type Model,
  noFormErrors,
  noJoinErrors,
  OutMessage,
  type PendingInvitation,
  Workspaces,
  WorkspacesDefinition
} from "./definition.ts"

type EnteringAs<Tag extends Entering["_tag"]> = Extract<Entering, { readonly _tag: Tag }>

/** The membership of `workspaceId` among `memberships`, when it is one. */
const findMembership = (
  memberships: ReadonlyArray<WorkspaceDirectory.Membership>,
  workspaceId: WorkspaceId.WorkspaceId
) => Option.fromUndefinedOr(memberships.find(({ workspace }) => workspace.id === workspaceId))

/** The invitation `invitationId` among those the listing holds, while it is loaded and has it. */
const findInvitation = (workspaces: Workspaces, invitationId: Invitation.InvitationId) =>
  Workspaces.matchOrElse(
    workspaces,
    {
      Loaded: ({ invitations }) =>
        Option.fromUndefinedOr(invitations.find(({ details }) => details.id === invitationId))
    },
    () => Option.none<PendingInvitation>()
  )

/** What the person is doing in the dialog, while it is the one `tag` names. */
const enteringAs = <const Tag extends Entering["_tag"]>(model: Model, tag: Tag): Option.Option<EnteringAs<Tag>> =>
  Option.filter(model.entering, Entering.isAnyOf([tag]))

/** The model with the form for creating as `change` makes it, while the person fills one. */
const atCreateForm = (model: Model, change: (form: EnteringAs<"FillingCreate">) => EnteringAs<"FillingCreate">) =>
  modifyFields(model, { entering: Option.map(Entering.matchOrElse({ FillingCreate: change }, (same) => same)) })

/** The model with the form for joining as `change` makes it, while the person fills one. */
const atJoinForm = (model: Model, change: (form: EnteringAs<"FillingJoin">) => EnteringAs<"FillingJoin">) =>
  modifyFields(model, { entering: Option.map(Entering.matchOrElse({ FillingJoin: change }, (same) => same)) })

/** Ask for a new workspace: no names yet, no request made, and nothing refused. */
const openCreateForm = WorkspacesDefinition.stepFields(() => ({
  entering: () =>
    Option.some(Entering.FillingCreate({ name: "", memberName: "", key: Option.none(), errors: noFormErrors }))
}))

/** Answer `invitation`, offering the name suggested from the person's address, and with nothing refused. */
const openJoinForm = (invitation: PendingInvitation) =>
  WorkspacesDefinition.step((model: Model) => ({
    model: modifyFields(model, {
      entering: () => Option.some(Entering.FillingJoin({ invitation, name: model.suggestedName, errors: noJoinErrors }))
    })
  }))

/** Once the workspace is created, the dialog opens it, while the person is still at the dialog. */
const openCreated = (workspace: Workspace.Workspace) =>
  WorkspacesDefinition.stepFields(() => ({
    entering: Option.map(
      Entering.matchOrElse(
        {
          SendingCreate: () =>
            Entering.Opening({ workspaceId: workspace.id, workspaceName: workspace.name, reloadFailed: false })
        },
        (same) => same
      )
    )
  }))

/** Once the person is in the workspace, the dialog has joined it, while the person is still at the dialog. */
const markJoined = WorkspacesDefinition.stepFields(() => ({
  entering: Option.map(
    Entering.matchOrElse(
      { SendingJoin: ({ invitation }) => Entering.Joined({ invitation, reloadFailed: false }) },
      (same) => same
    )
  )
}))

/** What `entering` becomes when reading the listing again, to open the workspace or to show a join, has failed, or starts over. */
const reloadFailedAs = (reloadFailed: boolean) =>
  Option.map(
    Entering.matchOrElse(
      {
        Opening: (opening) => Entering.Opening({ ...opening, reloadFailed }),
        Joined: (joined) => Entering.Joined({ ...joined, reloadFailed })
      },
      (same) => same
    )
  )

/** The listing while it is read again: what it listed, with nothing failed yet, or under way when it listed nothing. */
const listedAgain = Workspaces.matchOrElse(
  { Loaded: (loaded) => Workspaces.Loaded({ ...loaded, reloadFailed: false }) },
  () => Workspaces.Loading()
)

/** The listing once reading it again has failed: the list it kept, saying so, or not reached when it kept none. */
const failedToList = Workspaces.matchOrElse(
  { Loaded: (loaded) => Workspaces.Loaded({ ...loaded, reloadFailed: true }) },
  () => Workspaces.Unreachable()
)

/** Read the listing again, which is under way until it ends. */
const reload = WorkspacesDefinition.step((model: Model) => ({
  model: modifyFields(model, { workspaces: listedAgain, entering: reloadFailedAs(false) }),
  commands: [LoadWorkspaces()]
}))

/**
 * Tell the person they joined `workspace` with a toast that goes by itself after a while, and move focus to its
 * row, since the invitation's button they pressed has gone.
 */
const announceJoined = (workspace: Workspace.Workspace) =>
  WorkspacesDefinition.step((model: Model) => ({
    model: modifyFields(model, {
      toasts: (toasts) => [...toasts, { id: model.nextToastId, text: `Joined ${workspace.name}` }],
      nextToastId: (nextToastId) => nextToastId + 1
    }),
    commands: [ExpireToast({ toastId: model.nextToastId }), FocusWorkspaceRow({ workspaceId: workspace.id })]
  }))

/** The model without the toast `toastId`, which the person dismissed or whose time was up. */
const withoutToast = (model: Model, toastId: number) =>
  modifyFields(model, { toasts: (toasts) => toasts.filter(({ id }) => id !== toastId) })

export const update = WorkspacesComposition.makeUpdate((model, message) =>
  Message.match(message, {
    SucceededLoadWorkspaces: ({ memberships, invitations }) => {
      const listed = modifyFields(model, {
        workspaces: () => Workspaces.Loaded({ memberships, invitations, reloadFailed: false })
      })
      return Option.match(model.entering, {
        onNone: () => ({ model: listed }),
        onSome: Entering.matchOrElse(
          {
            Opening: ({ workspaceId }) =>
              Update.withOutMessage(
                Update.combine(listed, [leaveEntering, DialogBinding.requestClose()]),
                Option.match(findMembership(memberships, workspaceId), {
                  onNone: () => undefined,
                  onSome: (membership) => OutMessage.OpenedWorkspace({ membership })
                })
              ),
            Joined: ({ invitation }) =>
              Update.combine(listed, [
                leaveEntering,
                DialogBinding.requestClose(),
                ...Option.toArray(
                  Option.map(findMembership(memberships, invitation.details.workspaceId), ({ workspace }) =>
                    announceJoined(workspace)
                  )
                )
              ])
          },
          () => ({ model: listed })
        )
      })
    },
    FailedLoadWorkspaces: () => ({
      model: modifyFields(model, { workspaces: failedToList, entering: reloadFailedAs(true) })
    }),
    ClickedTryAgain: () => reload(model),
    ClickedWorkspace: ({ workspaceId }) =>
      Option.match(
        Workspaces.matchOrElse(
          model.workspaces,
          { Loaded: ({ memberships }) => findMembership(memberships, workspaceId) },
          () => Option.none()
        ),
        {
          onNone: () => ({ model }),
          onSome: (membership) => ({ model, outMessage: OutMessage.OpenedWorkspace({ membership }) })
        }
      ),
    ClickedAccept: ({ invitationId }) =>
      Option.match(findInvitation(model.workspaces, invitationId), {
        onNone: () => ({ model }),
        onSome: (invitation) => Update.combine(model, [openJoinForm(invitation), DialogBinding.requestOpen()])
      }),
    ClickedCreate: () => Update.combine(model, [openCreateForm, DialogBinding.requestOpen()]),
    TypedName: ({ name }) => ({
      model: atCreateForm(model, (form) =>
        Entering.FillingCreate({
          ...form,
          name,
          key: Option.none(),
          errors: modifyFields(form.errors, { name: () => Option.none(), form: () => Option.none() })
        })
      )
    }),
    TypedMemberName: ({ memberName }) => ({
      model: atCreateForm(model, (form) =>
        Entering.FillingCreate({
          ...form,
          memberName,
          key: Option.none(),
          errors: modifyFields(form.errors, { memberName: () => Option.none(), form: () => Option.none() })
        })
      )
    }),
    TypedJoinName: ({ name }) => ({
      model: atJoinForm(model, (form) => Entering.FillingJoin({ ...form, name, errors: noJoinErrors }))
    }),
    SubmittedCreate: () =>
      Option.match(enteringAs(model, "FillingCreate"), {
        onNone: () => ({ model }),
        onSome: ({ name, memberName, key }) =>
          hasWorkspaceName(name)
            ? {
                model: modifyFields(model, {
                  entering: () => Option.some(Entering.SendingCreate({ name, memberName, key }))
                }),
                commands: [CreateWorkspace({ name, memberName, key })]
              }
            : { model }
      }),
    SubmittedJoin: () =>
      Option.match(enteringAs(model, "FillingJoin"), {
        onNone: () => ({ model }),
        onSome: ({ invitation, name }) => ({
          model: modifyFields(model, { entering: () => Option.some(Entering.SendingJoin({ invitation, name })) }),
          commands: [
            AcceptInvitation({
              workspaceId: invitation.details.workspaceId,
              invitationId: invitation.details.id,
              name
            })
          ]
        })
      }),
    SucceededCreate: ({ workspace }) => Update.combine(model, [openCreated(workspace), reload]),
    FailedCreate: ({ key, error }) =>
      Option.match(enteringAs(model, "SendingCreate"), {
        onNone: () => ({ model }),
        onSome: ({ name, memberName }) => ({
          model: modifyFields(model, {
            entering: () => Option.some(Entering.FillingCreate({ name, memberName, key, errors: error }))
          })
        })
      }),
    SucceededJoin: () => Update.combine(model, [markJoined, reload]),
    FailedJoin: ({ error }) =>
      Option.match(enteringAs(model, "SendingJoin"), {
        onNone: () => ({ model }),
        onSome: ({ invitation, name }) => ({
          model: modifyFields(model, {
            entering: () => Option.some(Entering.FillingJoin({ invitation, name, errors: error }))
          })
        })
      }),
    RejectedSession: () => ({ model, outMessage: OutMessage.EndedSession() }),
    DismissedToast: ({ toastId }) => ({ model: withoutToast(model, toastId) }),
    ExpiredToast: ({ toastId }) => ({ model: withoutToast(model, toastId) }),
    CompletedFocusWorkspaceRow: () => ({ model }),
    CompletedSelectOnFocus: () => ({ model })
  })
)
