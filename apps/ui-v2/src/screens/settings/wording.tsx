import { Show } from "solid-js";
import { Button } from "../../components/button/index.ts";
import { Field } from "../../components/field/index.ts";
import type { AvatarToneName } from "../../foundations/color/tokens.ts";
import * as s from "./settings.css.ts";

/** A change made in settings. */
export type SettingsAction = "rename" | "transfer" | "role" | "remove" | "invite" | "revoke";

/**
 * Why a change or a read failed: `changed`, `denied`, and `gone` mean what the reader sees is out
 * of date; `refresh-failed` that a change completed but its result could not be loaded; and
 * `outdated` that the latest settings could not be loaded.
 */
export type SettingsError =
  | "changed"
  | "denied"
  | "gone"
  | "invalid"
  | "failed"
  | "refresh-failed"
  | "outdated";

/** Someone in the workspace, as settings shows them. */
export interface SettingsPerson {
  readonly id: string;
  readonly name: string;
  readonly initials?: string;
  readonly tone?: AvatarToneName;
  readonly agent?: boolean;
  /** The reader, shown as "· You". */
  readonly you?: boolean;
}

export interface SettingsRole {
  readonly id: string;
  readonly name: string;
}

export const displayName = (person: SettingsPerson) =>
  person.you ? `${person.name} · You` : person.name;

const changed: { readonly [Action in SettingsAction]: string } = {
  rename: "The name changed while you were editing. Refresh to see it, then save again.",
  transfer: "Ownership changed while you were choosing. Refresh to review it, then try again.",
  role: "Their access changed while you were editing. Refresh to review it, then save again.",
  remove: "Their membership changed meanwhile. Refresh to review it.",
  invite: "Invitations changed meanwhile. Refresh, then try again.",
  revoke: "This invitation changed meanwhile. Refresh to see where it stands.",
};
const gone: { readonly [Action in SettingsAction]: string } = {
  rename: "This workspace is no longer available to you.",
  transfer: "That member can no longer become the owner. Refresh to choose again.",
  role: "This member is no longer in the workspace. Refresh to see the latest.",
  remove: "This member is no longer in the workspace. Refresh to see the latest.",
  invite: "This workspace is no longer available to you.",
  revoke: "This invitation is no longer available. Refresh to see where it stands.",
};
const invalid: { readonly [Action in SettingsAction]: string } = {
  rename: "Enter a workspace name.",
  transfer: "Choose a new owner.",
  role: "Choose a role.",
  remove: "That change isn’t possible.",
  invite: "Enter the email they sign in with.",
  revoke: "That change isn’t possible.",
};
const failed: { readonly [Action in SettingsAction]: string } = {
  rename: "The name could not be saved. Try again when the host is available.",
  transfer: "Ownership could not be transferred. Try again when the host is available.",
  role: "The role could not be saved. Try again when the host is available.",
  remove: "The member could not be removed. Try again when the host is available.",
  invite:
    "The invitation could not be created. Try again when the host is available; it won’t be created twice.",
  revoke: "The invitation could not be revoked. Try again when the host is available.",
};

/** What went wrong, for the place the change was made; `refresh` covers reads. */
export function settingsMessage(action: SettingsAction | "refresh", error: SettingsError) {
  if (error === "outdated") return "The latest settings could not be loaded. Refresh to try again.";
  if (error === "refresh-failed")
    return action === "invite"
      ? "The invitation was created, but the latest invitations could not be loaded. Refresh to see it."
      : "Saved, but the latest settings could not be loaded. Refresh to continue.";
  if (error === "denied")
    return "You no longer have permission to do this. Refresh to review your access.";
  if (action === "refresh")
    return error === "changed" || error === "gone"
      ? "These settings changed meanwhile. Refresh to see the latest."
      : "The latest settings could not be loaded. Try again when the host is available.";
  if (error === "changed") return changed[action];
  if (error === "gone") return gone[action];
  if (error === "invalid") return invalid[action];
  return failed[action];
}

/** Whether the reader must reload before changing anything more. */
export const needsRefresh = (error: SettingsError) => error !== "invalid" && error !== "failed";

/** A change that completed, for a confirming toast. */
export function settingsToast(action: SettingsAction, subject?: string) {
  switch (action) {
    case "rename":
      return "Workspace renamed";
    case "transfer":
      return subject ? `${subject} is now the owner` : "Ownership transferred";
    case "role":
      return subject ? `Role saved for ${subject}` : "Role saved";
    case "remove":
      return subject ? `${subject} was removed` : "Member removed";
    case "invite":
      return "Invitation created";
    case "revoke":
      return "Invitation revoked";
  }
}

export interface SettingsAlertProps {
  readonly action: SettingsAction | "refresh";
  readonly error: SettingsError;
  /** Reloads the settings; offered when the values are out of date. */
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** A failed change or read, with Refresh when the values on screen are out of date. */
export function SettingsAlert(props: SettingsAlertProps) {
  return (
    <div class={s.alert}>
      <Field.Alert>{settingsMessage(props.action, props.error)}</Field.Alert>
      <Show when={props.onRefresh && needsRefresh(props.error)}>
        <Button
          variant="quiet"
          class={s.alertAction}
          disabled={props.refreshing}
          onClick={() => props.onRefresh?.()}
        >
          {props.refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </Show>
    </div>
  );
}
