import { useGroups, useWorkspacePermission } from "@amends/client";
import { Navigation } from "@amends/ui/compositions/navigation";
import { Divider } from "@amends/ui/primitives/divider";
import { IconButton } from "@amends/ui/primitives/icon-button";
import { createSignal, For, Show } from "solid-js";
import { keyed } from "../internal/keyed.ts";
import { useGroupLabel } from "./group-name.tsx";
import { NewGroupDialog } from "./new-group.tsx";

export interface GroupsNavigationProps {
  readonly workspaceId: string;
  /** Where each group's link leads. */
  readonly href: (groupId: string) => string;
  /** The group whose page is open. */
  readonly current?: string;
  /** A group the reader created here; the app decides where that leads. */
  readonly onCreated?: (groupId: string) => void;
}
/**
 * The reader's groups as a navigation section, live while mounted: teams by name, direct groups
 * by the other people in them, each marked when it has new activity or something for the reader.
 * A reader who may create groups gets a "New group" action in its heading, shown even before they
 * belong to any.
 */
export function GroupsNavigation(props: GroupsNavigationProps) {
  const groups = useGroups(props.workspaceId);
  const rows = keyed(
    () => groups.value() ?? [],
    (item) => item.group.id,
  );
  const label = useGroupLabel(props.workspaceId);
  const creator = useWorkspacePermission(props.workspaceId, "group.create");
  const [creating, setCreating] = createSignal(false);
  return (
    <Show when={rows.ids().length > 0 || creator()}>
      <Navigation.Section>
        <Navigation.SectionHeader>
          <Navigation.SectionLabel>Groups</Navigation.SectionLabel>
          <Divider.Line />
          <Show when={creator()}>
            <Navigation.SectionActions>
              <IconButton
                variant="ghost"
                size="compact"
                aria-label="New group"
                aria-haspopup="dialog"
                onClick={() => setCreating(true)}
              >
                +
              </IconButton>
            </Navigation.SectionActions>
          </Show>
        </Navigation.SectionHeader>
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
  );
}
