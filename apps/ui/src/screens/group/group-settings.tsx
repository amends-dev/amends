import { Match, Show, Switch, createEffect, createSignal, createUniqueId } from "solid-js";
import { IconMarkNew } from "@amends/icons";
import { Avatar } from "../../components/avatar/index.ts";
import { Button } from "../../components/button/index.ts";
import { Choice } from "../../components/choice/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { MemberPicker, type PickerPerson } from "../../components/member-picker/index.ts";
import { Tabs } from "../../components/tabs/index.ts";
import type { AvatarToneName } from "../../foundations/color/tokens.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { createMediaQuery } from "../../internal/media.ts";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Keyed } from "../../internal/keyed.tsx";
import * as s from "./settings.css.ts";

export type GroupSettingsTab = "general" | "members";
export type GroupVisibility = "public" | "private";

/** Why a change to the group was not made. */
export type GroupChangeError = "changed" | "denied" | "gone" | "invalid" | "failed";

const renameErrors: { readonly [Error in GroupChangeError]: string } = {
  changed: "Someone renamed this group meanwhile. Save again to replace their name.",
  denied: "You can no longer rename this group.",
  gone: "This group is no longer available to you.",
  invalid: "Use 1 to 80 characters, with no invisible ones.",
  failed: "The name could not be saved. Try again when the host is available.",
};
const memberErrors: { readonly [Error in GroupChangeError]: string } = {
  changed: "The members changed meanwhile. Check the list and try again.",
  denied: "You can no longer change this group’s members.",
  gone: "That person is no longer in the workspace or this group.",
  invalid: "That change isn’t possible here.",
  failed: "The change could not be made. Try again when the host is available.",
};

export interface SettingsMember {
  readonly id: string;
  readonly name: string;
  readonly initials?: string;
  readonly tone?: AvatarToneName;
  readonly agent?: boolean;
  /** The reader, shown as "You". */
  readonly you?: boolean;
  /** The reader may remove this member. */
  readonly removable?: boolean;
}

export interface GroupSettingsProps {
  readonly open: boolean;
  /** A direct conversation shows only its fixed members. Default "team". */
  readonly kind?: "team" | "direct";
  readonly onClose: () => void;
  /** The saved name, shown as the dialog's context. */
  readonly groupName: string;
  readonly tab: GroupSettingsTab;
  readonly onTabChange: (tab: GroupSettingsTab) => void;
  /** The name being edited. */
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly nameError?: string;
  /** The reader may rename the group. Default true. */
  readonly renamable?: boolean;
  /** Opens with the name ready to edit, as when the reader asked to rename the group. */
  readonly focusName?: boolean;
  /** Why the last save failed. */
  readonly saveError?: GroupChangeError;
  readonly visibility: GroupVisibility;
  readonly onVisibilityChange: (visibility: GroupVisibility) => void;
  /** Visibility is shown but cannot change. */
  readonly visibilityLocked?: boolean;
  /** Name or visibility differs from what is saved. */
  readonly changed: boolean;
  readonly saving?: boolean;
  readonly onSave: () => void;
  /** The reader belongs to the group. */
  readonly member: boolean;
  /** The workspace's general group: everyone belongs to it, and people never leave it. */
  readonly general?: boolean;
  /** The reader may leave. Default true. */
  readonly leavable?: boolean;
  readonly leaving?: boolean;
  readonly onLeave: () => void;
  readonly onJoin?: () => void;
  /** The reader may add members. Default true. */
  readonly canAdd?: boolean;
  /** The member being removed, if any. */
  readonly removingId?: string;
  /** Why the last change to the members failed. */
  readonly membersError?: GroupChangeError;
  readonly members: readonly SettingsMember[];
  readonly onRemove: (id: string) => void;
  /** Workspace members who are not in the group. */
  readonly candidates: readonly PickerPerson[];
  readonly selected: readonly string[];
  readonly onSelectedChange: (ids: string[]) => void;
  readonly onAdd: () => void;
  readonly adding?: boolean;
}

const visibilityHints: Record<GroupVisibility, string> = {
  public: "Anyone in the workspace can find this group and join it.",
  private: "Only people added to this group can find it.",
};

/**
 * A group's settings in a modal: General (name, visibility, and your membership) and Members
 * (add and remove people). On phones it fills the screen and adding members opens its own view.
 */
export function GroupSettings(props: GroupSettingsProps) {
  const formId = `group-settings-${createUniqueId()}`;
  const phone = createMediaQuery(media.mobile);
  const [addView, setAddView] = createSignal(false);
  // Asked to rename, the dialog opens with the name selected, ready to type over.
  const [nameField, setNameField] = createSignal<HTMLInputElement>();
  createEffect(() => {
    const field = nameField();
    if (!props.open || !props.focusName || !field) return;
    queueMicrotask(() => {
      field.focus();
      field.select();
    });
  });
  const addLabel = () => (props.selected.length > 0 ? `Add ${props.selected.length}` : "Add");
  const close = () => {
    setAddView(false);
    props.onClose();
  };
  return (
    <Modal.Root open={props.open} onClose={close} aria-label="Group settings">
      <Show
        when={!(phone() && addView())}
        fallback={
          <Pane.Root variant="modal">
            <Pane.Header>
              <Pane.Back always aria-label="Back to members" onClick={() => setAddView(false)} />
              <Pane.Title context={`# ${props.groupName}`}>Add members</Pane.Title>
            </Pane.Header>
            <Pane.Body>
              <Field.Root>
                <Field.Label>Search workspace members</Field.Label>
                <MemberPicker
                  presentation="list"
                  candidates={props.candidates}
                  selected={props.selected}
                  onSelectedChange={props.onSelectedChange}
                />
              </Field.Root>
            </Pane.Body>
            <Modal.Actions>
              <Button
                variant="primary"
                wide
                disabled={props.selected.length === 0 || props.adding}
                onClick={() => {
                  props.onAdd();
                  setAddView(false);
                }}
              >
                {props.selected.length === 0
                  ? "Add members"
                  : props.selected.length === 1
                    ? "Add 1 member"
                    : `Add ${props.selected.length} members`}
              </Button>
            </Modal.Actions>
          </Pane.Root>
        }
      >
        <Pane.Root variant="modal">
          <Pane.Header>
            <Pane.Title
              context={props.kind === "direct" ? props.groupName : `# ${props.groupName}`}
            >
              {props.kind === "direct" ? "Members" : "Group settings"}
            </Pane.Title>
            <Pane.Actions>
              <Pane.Close label="Close settings" onClick={close} />
            </Pane.Actions>
            <Show when={props.kind !== "direct"}>
              <Pane.Tabs>
                <Tabs.List aria-label="Group settings">
                  <Tabs.Tab
                    current={props.tab === "general"}
                    onClick={() => props.onTabChange("general")}
                  >
                    General
                  </Tabs.Tab>
                  <Tabs.Tab
                    current={props.tab === "members"}
                    count={props.members.length}
                    onClick={() => props.onTabChange("members")}
                  >
                    Members
                  </Tabs.Tab>
                </Tabs.List>
              </Pane.Tabs>
            </Show>
          </Pane.Header>
          <Switch>
            <Match when={props.tab === "general" && props.kind !== "direct"}>
              <Pane.Body>
                <form
                  id={formId}
                  class={s.form}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (props.changed && !props.saving) props.onSave();
                  }}
                >
                  <Field.Root
                    hint={
                      props.renamable === false
                        ? "Only people who manage this group can rename it."
                        : "Everyone in this group sees this name."
                    }
                    error={
                      props.nameError ??
                      (props.saveError === "invalid" ? renameErrors.invalid : undefined)
                    }
                  >
                    <Field.Label>Group name</Field.Label>
                    <Input
                      ref={setNameField}
                      value={props.name}
                      onInput={(event) => props.onNameChange(event.currentTarget.value)}
                      autocomplete="off"
                      maxLength={80}
                      disabled={props.renamable === false || props.saving}
                      required
                    />
                  </Field.Root>
                  <Show when={props.saveError && props.saveError !== "invalid" && props.saveError}>
                    {(error) => <Field.Alert>{renameErrors[error()]}</Field.Alert>}
                  </Show>
                  <Show
                    when={!props.visibilityLocked}
                    fallback={
                      <div class={s.readonly}>
                        <h3 class={s.heading}>Visibility</h3>
                        <p class={s.note}>
                          {props.visibility === "public" ? "Public. " : "Private. "}
                          {visibilityHints[props.visibility]}
                        </p>
                      </div>
                    }
                  >
                    <Choice.Group
                      label="Visibility"
                      value={props.visibility}
                      onChange={(value) => props.onVisibilityChange(value as GroupVisibility)}
                      hint={visibilityHints[props.visibility]}
                    >
                      <Choice.Option value="public">Public</Choice.Option>
                      <Choice.Option value="private">Private</Choice.Option>
                    </Choice.Group>
                  </Show>
                  <Divider />
                  <div class={s.membership}>
                    <div class={s.membershipText}>
                      <h3 class={s.heading}>Membership</h3>
                      <p class={s.note}>
                        {props.general
                          ? "Everyone in the workspace belongs to this group."
                          : props.member
                            ? "You’re a member of this group."
                            : "You’re not a member of this group."}
                      </p>
                    </div>
                    <Show
                      when={props.member}
                      fallback={
                        <Show when={props.onJoin}>
                          {(join) => <Button onClick={() => join()()}>Join group</Button>}
                        </Show>
                      }
                    >
                      <Show when={props.leavable !== false && !props.general}>
                        <Button disabled={props.leaving} onClick={() => props.onLeave()}>
                          Leave group
                        </Button>
                      </Show>
                    </Show>
                  </div>
                </form>
              </Pane.Body>
              <Modal.Actions>
                <Button onClick={close}>Cancel</Button>
                <Button
                  type="submit"
                  form={formId}
                  variant="primary"
                  disabled={!props.changed || props.saving}
                >
                  Save changes
                </Button>
              </Modal.Actions>
            </Match>
            <Match when={props.tab === "members" || props.kind === "direct"}>
              <Pane.Body>
                <div class={s.members}>
                  <Show when={props.membersError}>
                    {(error) => <Field.Alert>{memberErrors[error()]}</Field.Alert>}
                  </Show>
                  <Show when={props.canAdd !== false}>
                    <Show
                      when={!phone()}
                      fallback={
                        <Button icon={IconMarkNew} wide onClick={() => setAddView(true)}>
                          Add members
                        </Button>
                      }
                    >
                      <Field.Root>
                        <Field.Label>Add members</Field.Label>
                        <div class={s.addRow}>
                          <MemberPicker
                            candidates={props.candidates}
                            selected={props.selected}
                            onSelectedChange={props.onSelectedChange}
                          />
                          <Button
                            variant={props.selected.length > 0 ? "primary" : "secondary"}
                            class={s.addButton}
                            disabled={props.selected.length === 0 || props.adding}
                            onClick={() => props.onAdd()}
                          >
                            {addLabel()}
                          </Button>
                        </div>
                      </Field.Root>
                    </Show>
                  </Show>
                  <div class={s.count}>
                    <span class={s.countLabel}>
                      {props.members.length === 1 ? "1 member" : `${props.members.length} members`}
                    </span>
                    <Divider class={s.countStitch} />
                  </div>
                  <ul class={s.list} aria-label="Members">
                    <Keyed each={props.members} by={(person) => person.id}>
                      {(person) => (
                        <li class={s.member}>
                          <Avatar
                            name={person().name}
                            initials={person().initials}
                            tone={person().tone}
                            size={28}
                            class={s.avatar}
                            decorative
                          />
                          <span class={s.memberText}>
                            <span class={s.memberName}>{person().name}</span>
                            <Show when={person().you}>
                              <span class={s.memberKind}>You</span>
                            </Show>
                            <Show when={person().agent}>
                              <span class={s.memberKind}>Agent</span>
                            </Show>
                          </span>
                          <Show when={person().removable}>
                            <Button
                              variant="quiet"
                              aria-label={`Remove ${person().name}`}
                              disabled={props.removingId === person().id}
                              onClick={() => props.onRemove(person().id)}
                            >
                              Remove
                            </Button>
                          </Show>
                        </li>
                      )}
                    </Keyed>
                  </ul>
                </div>
              </Pane.Body>
              <Modal.Actions>
                <Button onClick={close}>Done</Button>
              </Modal.Actions>
            </Match>
          </Switch>
        </Pane.Root>
      </Show>
    </Modal.Root>
  );
}
