import { useGroups, useWorkspacePermission, type Group } from "@amends/client";
import { Navigation } from "@amends/ui/compositions/navigation";
import { Divider } from "@amends/ui/primitives/divider";
import { IconButton } from "@amends/ui/primitives/icon-button";
import { createSignal, For, Show, type Accessor } from "solid-js";
import { keyed } from "../internal/keyed.ts";
import type { MessageTarget } from "./direct.tsx";
import { NewMessageDialog } from "./direct.tsx";
import { useGroupLabel } from "./group-name.tsx";
import { NewGroupDialog } from "./new-group.tsx";

export interface GroupsNavigationProps {
  readonly workspaceId: string;
  /** Where each group's link leads. */
  readonly href: (groupId: string) => string;
  /** The group whose page is open. */
  readonly current?: string;
  /** Where browsing the workspace's public groups leads. */
  readonly browseHref?: string;
  /** The public groups are open. */
  readonly browsing?: boolean;
  /** A group the reader created here; the app decides where that leads. */
  readonly onCreated?: (groupId: string) => void;
  /**
   * People the reader chose to message: their direct group, or the people when they have none
   * yet. The app decides where that leads.
   */
  readonly onMessage?: (target: MessageTarget) => void;
}
/** One section's groups as navigation links, keyed so live refreshes keep each link. */
function Links(props: {
  readonly items: Accessor<ReadonlyArray<Group.ListItem>>;
  readonly workspaceId: string;
  readonly href: (groupId: string) => string;
  readonly current?: string;
}) {
  const rows = keyed(props.items, (item) => item.group.id);
  const label = useGroupLabel(props.workspaceId);
  return (
    <For each={rows.ids()}>
      {(id) => {
        const item = () => rows.get(id)!;
        return (
          <Navigation.Link
            href={props.href(id)}
            aria-current={props.current === id ? "page" : undefined}
          >
            {/* The Shell reference marks channels with a text glyph. */}
            <Navigation.Icon>{item().group.kind === "Team" ? "#" : "@"}</Navigation.Icon>
            <Navigation.Label>{label(item().group)}</Navigation.Label>
            <Show when={item().pending > 0}>
              <Navigation.Count aria-label={`${item().pending} for you`}>
                {String(item().pending)}
              </Navigation.Count>
            </Show>
            <Show when={item().newActivity}>
              <Navigation.Dot label="new activity" />
            </Show>
          </Navigation.Link>
        );
      }}
    </For>
  );
}
function Action(props: { readonly label: string; readonly onClick: () => void }) {
  return (
    <Navigation.SectionActions>
      <IconButton
        variant="ghost"
        size="compact"
        aria-label={props.label}
        aria-haspopup="dialog"
        onClick={() => props.onClick()}
      >
        +
      </IconButton>
    </Navigation.SectionActions>
  );
}
/**
 * The reader's groups as two navigation sections, live while mounted: team groups by name, and
 * direct groups by the other people in them, each marked when it has new activity or something
 * for the reader. Groups offers "New group" to a reader who may create groups, and "Browse
 * groups" to everyone, even before they belong to any; Direct offers everyone "New message".
 */
export function GroupsNavigation(props: GroupsNavigationProps) {
  const groups = useGroups(props.workspaceId);
  const teams = () => (groups.value() ?? []).filter((item) => item.group.kind === "Team");
  const direct = () => (groups.value() ?? []).filter((item) => item.group.kind === "Direct");
  const creator = useWorkspacePermission(props.workspaceId, "group.create");
  const [creating, setCreating] = createSignal(false);
  const [messaging, setMessaging] = createSignal(false);
  return (
    <>
      <Show when={groups.value() !== undefined || creator()}>
        <Navigation.Section>
          <Navigation.SectionHeader>
            <Navigation.SectionLabel>Groups</Navigation.SectionLabel>
            <Divider.Line />
            <Show when={creator()}>
              <Action label="New group" onClick={() => setCreating(true)} />
            </Show>
          </Navigation.SectionHeader>
          <Links
            items={teams}
            workspaceId={props.workspaceId}
            href={props.href}
            current={props.current}
          />
          <Show when={props.browseHref}>
            {(href) => (
              <Navigation.Link href={href()} aria-current={props.browsing ? "page" : undefined}>
                <Navigation.Icon>+</Navigation.Icon>
                <Navigation.Label>Browse groups</Navigation.Label>
              </Navigation.Link>
            )}
          </Show>
          <Show when={creator()}>
            <NewGroupDialog
              workspaceId={props.workspaceId}
              open={creating()}
              onOpenChange={setCreating}
              onCreated={(groupId) => props.onCreated?.(groupId)}
            />
          </Show>
        </Navigation.Section>
      </Show>
      <Show when={groups.value() !== undefined}>
        <Navigation.Section>
          <Navigation.SectionHeader>
            <Navigation.SectionLabel>Direct</Navigation.SectionLabel>
            <Divider.Line />
            <Action label="New message" onClick={() => setMessaging(true)} />
          </Navigation.SectionHeader>
          <Links
            items={direct}
            workspaceId={props.workspaceId}
            href={props.href}
            current={props.current}
          />
          <NewMessageDialog
            workspaceId={props.workspaceId}
            open={messaging()}
            onOpenChange={setMessaging}
            onChoose={(target) => props.onMessage?.(target)}
          />
        </Navigation.Section>
      </Show>
    </>
  );
}
