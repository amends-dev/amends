import { useGroups } from "@amends/client";
import { Navigation } from "@amends/ui/compositions/navigation";
import { Divider } from "@amends/ui/primitives/divider";
import { For, Show } from "solid-js";
import { keyed } from "../internal/keyed.ts";
import { useGroupLabel } from "./group-name.tsx";

export interface GroupsNavigationProps {
  readonly workspaceId: string;
  /** Where each group's link leads. */
  readonly href: (groupId: string) => string;
  /** The group whose page is open. */
  readonly current?: string;
}
/**
 * The reader's groups as a navigation section, live while mounted: teams by name, direct groups
 * by the other people in them, each marked when it has new activity or something for the reader.
 */
export function GroupsNavigation(props: GroupsNavigationProps) {
  const groups = useGroups(props.workspaceId);
  const rows = keyed(
    () => groups.value() ?? [],
    (item) => item.group.id,
  );
  const label = useGroupLabel(props.workspaceId);
  return (
    <Show when={rows.ids().length > 0}>
      <Navigation.Section>
        <Navigation.SectionHeader>
          <Navigation.SectionLabel>Groups</Navigation.SectionLabel>
          <Divider.Line />
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
      </Navigation.Section>
    </Show>
  );
}
