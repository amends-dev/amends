import type { Invitation, WorkspaceId } from "@amends-dev/core/workspace"
import type * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { AcceptInvitation, CreateWorkspace, LoadWorkspaces } from "./command.ts"
import { DialogBinding, leaveEntering, WorkspacesComposition } from "./composition.ts"
import {
  Entering,
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

/** Answer `invitation`: no name yet, and nothing refused. */
const openJoinForm = (invitation: PendingInvitation) =>
  WorkspacesDefinition.stepFields(() => ({
    entering: () => Option.some(Entering.FillingJoin({ invitation, name: "", errors: noJoinErrors }))
  }))

/** What `entering` becomes when reading the listing again, to open the workspace, has failed, or starts over. */
const reloadFailedAs = (reloadFailed: boolean) =>
  Option.map(
    Entering.matchOrElse({ Opening: (opening) => Entering.Opening({ ...opening, reloadFailed }) }, (same) => same)
  )

/** Read the listing again, which is under way until it ends. */
const reload = WorkspacesDefinition.step((model: Model) => ({
  model: modifyFields(model, { workspaces: () => Workspaces.Loading(), entering: reloadFailedAs(false) }),
  commands: [LoadWorkspaces()]
}))

export const update = WorkspacesComposition.makeUpdate((model, message) =>
  Message.match(message, {
    SucceededLoadWorkspaces: ({ memberships, invitations }) => {
      const listed = modifyFields(model, { workspaces: () => Workspaces.Loaded({ memberships, invitations }) })
      return Option.match(enteringAs(model, "Opening"), {
        onNone: () => ({ model: listed }),
        onSome: ({ workspaceId }) =>
          Update.withOutMessage(
            Update.combine(listed, [leaveEntering, DialogBinding.requestClose()]),
            Option.match(findMembership(memberships, workspaceId), {
              onNone: () => undefined,
              onSome: (membership) => OutMessage.OpenedWorkspace({ membership })
            })
          )
      })
    },
    FailedLoadWorkspaces: ({ error }) => ({
      model: modifyFields(model, { workspaces: () => Workspaces.Failed({ error }), entering: reloadFailedAs(true) })
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
        onSome: ({ name, memberName, key }) => ({
          model: modifyFields(model, {
            entering: () => Option.some(Entering.SendingCreate({ name, memberName, key }))
          }),
          commands: [CreateWorkspace({ name, memberName, key })]
        })
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
    SucceededCreate: ({ workspace }) => ({
      model: Option.isSome(enteringAs(model, "SendingCreate"))
        ? modifyFields(model, {
            entering: () =>
              Option.some(
                Entering.Opening({
                  workspaceId: workspace.id,
                  workspaceName: Option.some(workspace.name),
                  reloadFailed: false
                })
              )
          })
        : model,
      commands: [LoadWorkspaces()]
    }),
    FailedCreate: ({ key, error }) =>
      Option.match(enteringAs(model, "SendingCreate"), {
        onNone: () => ({ model }),
        onSome: ({ name, memberName }) => ({
          model: modifyFields(model, {
            entering: () => Option.some(Entering.FillingCreate({ name, memberName, key, errors: error }))
          })
        })
      }),
    SucceededJoin: ({ member }) => ({
      model: Option.match(enteringAs(model, "SendingJoin"), {
        onNone: () => model,
        onSome: ({ invitation }) =>
          modifyFields(model, {
            entering: () =>
              Option.some(
                Entering.Opening({
                  workspaceId: member.workspaceId,
                  workspaceName: Option.fromUndefinedOr(invitation.workspaceName),
                  reloadFailed: false
                })
              )
          })
      }),
      commands: [LoadWorkspaces()]
    }),
    FailedJoin: ({ error }) =>
      Option.match(enteringAs(model, "SendingJoin"), {
        onNone: () => ({ model }),
        onSome: ({ invitation, name }) => ({
          model: modifyFields(model, {
            entering: () => Option.some(Entering.FillingJoin({ invitation, name, errors: error }))
          })
        })
      })
  })
)
