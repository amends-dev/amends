import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { ChangeRole, CopyWorkspaceId, ExpireCopied, RenameSelf, RenameWorkspace } from "./command.ts"
import { SettingsComposition } from "./composition.ts"
import {
  type Failure,
  findMember,
  isNameChanged,
  isRoleChanged,
  Message,
  type Model,
  mayChangeRole,
  mayRename,
  type NameEdit,
  OutMessage,
  ownName,
  type Reason,
  type Selected,
  type SettingsAction,
  workspaceRolesOf,
  Written
} from "./definition.ts"

const failureOf = (action: SettingsAction, reason: Reason): Failure => ({ action, reason })

/** What the person typed in the field of a name, with no failure left from the name before it, while it is not on its way. */
const typedName = (edit: Option.Option<NameEdit>, name: string): Option.Option<NameEdit> =>
  Option.some(
    Option.match(edit, {
      onNone: () => ({ name, isSaving: false, failure: Option.none() }),
      onSome: (typing) => (typing.isSaving ? typing : { ...typing, name, failure: Option.none() })
    })
  )

/** The edit of a name once it is sent, which waits for the store to keep it. */
const sentName = (edit: NameEdit): NameEdit => ({ ...edit, isSaving: true, failure: Option.none() })

/** The edit of a name once `failure` kept it from being sent or kept. */
const refusedName =
  (failure: Failure) =>
  (edit: NameEdit): NameEdit => ({ ...edit, isSaving: false, failure: Option.some(failure) })

/** The model with the name of the workspace being changed as `change` makes it, while one is. */
const atWorkspaceName = (model: Model, change: (edit: NameEdit) => NameEdit): Model =>
  modifyFields(model, { workspaceName: Option.map(change) })

/** The model with the person's own name being changed as `change` makes it, while it is. */
const atOwnName = (model: Model, change: (edit: NameEdit) => NameEdit): Model =>
  modifyFields(model, { ownName: Option.map(change) })

/** The model with the member open as `change` makes them, while one is. */
const atSelected = (model: Model, change: (selected: Selected) => Selected): Model =>
  modifyFields(model, { selected: Option.map(change) })

/** Send the name the person typed for the workspace, when it is one to save and they may rename it. */
const submitWorkspaceName = (model: Model) =>
  Option.match(model.workspaceName, {
    onNone: () => ({ model }),
    onSome: (edit) => {
      if (edit.isSaving) {
        return { model }
      }

      return Option.match(model.workspace, {
        onNone: () => ({ model: atWorkspaceName(model, refusedName(failureOf("Rename", "Gone"))) }),
        onSome: ({ workspace }) => {
          if (!isNameChanged(edit.name, workspace.name)) {
            return { model }
          }

          if (!mayRename(model)) {
            return { model: atWorkspaceName(model, refusedName(failureOf("Rename", "Denied"))) }
          }

          const { workspaceId, memberId } = model
          return {
            model: atWorkspaceName(model, sentName),
            commands: [RenameWorkspace({ workspaceId, memberId, name: edit.name.trim(), expectedName: workspace.name })]
          }
        }
      })
    }
  })

/** Send the name the person typed for themselves, when it is one to save and the replica holds their membership. */
const submitOwnName = (model: Model) =>
  Option.match(model.ownName, {
    onNone: () => ({ model }),
    onSome: (edit) => {
      if (edit.isSaving) {
        return { model }
      }

      if (Option.isNone(findMember(model, model.memberId))) {
        return { model: atOwnName(model, refusedName(failureOf("RenameSelf", "Gone"))) }
      }

      if (!isNameChanged(edit.name, ownName(model))) {
        return { model }
      }

      const { workspaceId, memberId } = model
      return {
        model: atOwnName(model, sentName),
        commands: [RenameSelf({ workspaceId, memberId, name: edit.name.trim() })]
      }
    }
  })

/** Send the role the person chose for the member open as a replacement of the roles they saw the member hold. */
const submitRole = (model: Model) =>
  Option.match(model.selected, {
    onNone: () => ({ model }),
    onSome: (selected) => {
      const refuse = (reason: Reason) => ({
        model: atSelected(model, (open) => ({ ...open, failure: Option.some(failureOf("ChangeRole", reason)) }))
      })

      if (selected.isSaving || Option.isNone(selected.roleId) || !isRoleChanged(model, selected)) {
        return { model }
      }

      if (Option.isNone(findMember(model, selected.memberId))) {
        return refuse("Gone")
      }

      if (!mayChangeRole(model, selected.memberId)) {
        return refuse("Denied")
      }

      const { workspaceId, memberId } = model
      return {
        model: atSelected(model, (open) => ({ ...open, isSaving: true, failure: Option.none() })),
        commands: [
          ChangeRole({
            workspaceId,
            memberId,
            changeMemberId: selected.memberId,
            roleId: selected.roleId.value,
            expectedAssignmentIds: workspaceRolesOf(model, selected.memberId).map(({ id }) => id)
          })
        ]
      }
    }
  })

export const update = SettingsComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedSettings: ({ workspace, members, roles, assignments, grants }) => ({
      model: modifyFields(model, {
        workspace: () => workspace,
        members: () => members,
        roles: () => roles,
        assignments: () => assignments,
        grants: () => grants,
        isUnreadable: () => false
      })
    }),
    FailedRead: () => ({ model: modifyFields(model, { isUnreadable: () => true }) }),
    // What the person sees is out of date: it is read again, and what failed is no longer shown.
    ClickedRefresh: () => ({
      model: modifyFields(model, {
        isUnreadable: () => false,
        reads: (reads) => reads + 1,
        workspaceName: Option.map((edit) => ({ ...edit, failure: Option.none() })),
        ownName: Option.map((edit) => ({ ...edit, failure: Option.none() })),
        selected: Option.map((selected) => ({ ...selected, failure: Option.none() }))
      })
    }),
    TypedWorkspaceName: ({ name }) => ({
      model: modifyFields(model, { workspaceName: (edit) => typedName(edit, name) })
    }),
    SubmittedWorkspaceName: () => submitWorkspaceName(model),
    TypedOwnName: ({ name }) => ({ model: modifyFields(model, { ownName: (edit) => typedName(edit, name) }) }),
    SubmittedOwnName: () => submitOwnName(model),
    ClickedCopyId: () => ({
      model: modifyFields(model, { copyAttempts: (attempts) => attempts + 1 }),
      commands: [CopyWorkspaceId({ workspaceId: model.workspaceId, attempt: model.copyAttempts + 1 })]
    }),
    CopiedWorkspaceId: ({ attempt }) => ({
      model: modifyFields(model, { copiedAttempt: () => Option.some(attempt) }),
      commands: [ExpireCopied({ attempt })]
    }),
    FailedCopyWorkspaceId: () => ({ model }),
    ExpiredCopied: ({ attempt }) => ({
      model: modifyFields(model, { copiedAttempt: Option.filter((copied) => copied !== attempt) })
    }),
    TypedMemberQuery: ({ query }) => ({
      model: modifyFields(model, { filter: (filter) => ({ ...filter, query }) })
    }),
    ChoseMemberStatus: ({ status }) => ({
      model: modifyFields(model, { filter: (filter) => ({ ...filter, status }) })
    }),
    ClickedMember: ({ memberId }) =>
      Option.isSome(findMember(model, memberId))
        ? {
            model: modifyFields(model, {
              selected: () => Option.some({ memberId, roleId: Option.none(), isSaving: false, failure: Option.none() })
            }),
            outMessage: OutMessage.OpenedMember({ memberId })
          }
        : { model },
    ClickedCloseMember: () => ({
      model: modifyFields(model, { selected: () => Option.none() }),
      outMessage: OutMessage.ClosedMember()
    }),
    ChoseRole: ({ roleId }) => ({
      model: atSelected(model, (selected) =>
        selected.isSaving ? selected : { ...selected, roleId: Option.some(roleId), failure: Option.none() }
      )
    }),
    SubmittedRole: () => submitRole(model),
    WroteAction: ({ written }) => ({
      model: Written.match(written, {
        Rename: () => modifyFields(model, { workspaceName: () => Option.none() }),
        RenameSelf: () => modifyFields(model, { ownName: () => Option.none() }),
        ChangeRole: ({ memberId }) =>
          atSelected(model, (selected) =>
            selected.memberId === memberId
              ? { ...selected, roleId: Option.none(), isSaving: false, failure: Option.none() }
              : selected
          )
      })
    }),
    FailedWriteAction: ({ written, reason }) => ({
      model: Written.match(written, {
        Rename: () => atWorkspaceName(model, refusedName(failureOf("Rename", reason))),
        RenameSelf: () => atOwnName(model, refusedName(failureOf("RenameSelf", reason))),
        ChangeRole: ({ memberId }) =>
          atSelected(model, (selected) =>
            selected.memberId === memberId
              ? { ...selected, isSaving: false, failure: Option.some(failureOf("ChangeRole", reason)) }
              : selected
          )
      })
    })
  })
)
