import { For, Show } from "solid-js";
import { IconMarkChannel, IconMarkOpen, IconUsers } from "@amends/icons";
import { Badge } from "../../components/badge/index.ts";
import { Button } from "../../components/button/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { SearchField } from "../../components/input/index.ts";
import { Tabs } from "../../components/tabs/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import * as s from "./directory.css.ts";

export type DirectoryTab = "joined" | "discover";

export interface DirectoryGroup {
  readonly id: string;
  readonly name: string;
  readonly visibility: "public" | "private";
  readonly memberCount: number;
  /** The group, or its preview when the reader has not joined. */
  readonly href: string;
}

export interface GroupDirectoryProps {
  readonly tab: DirectoryTab;
  readonly tabHref: (tab: DirectoryTab) => string;
  /** Switches tabs in place of following their links. */
  readonly onTabChange?: (tab: DirectoryTab) => void;
  readonly joinedCount: number;
  readonly discoverCount: number;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** The current tab's groups, after searching. */
  readonly groups: readonly DirectoryGroup[];
  /** Opens a group in place of following its link, such as into a preview. */
  readonly onOpenGroup?: (id: string) => void;
  readonly onJoin: (id: string) => void;
  /** The group being joined, if any. */
  readonly joiningId?: string;
  readonly onCreateGroup: () => void;
}

const tabs = [
  { id: "joined", label: "Your groups" },
  { id: "discover", label: "Discover" },
] as const;

/**
 * The Groups page: the groups the reader belongs to, and public groups to discover, read before
 * joining, and join.
 */
export function GroupDirectory(props: GroupDirectoryProps) {
  const discover = () => props.tab === "discover";
  const count = (n: number) => (n === 1 ? "1 group" : `${n} groups`);
  return (
    <Pane.Root>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title icon={IconUsers}>Groups</Pane.Title>
        <Pane.Actions>
          <Button onClick={() => props.onCreateGroup()}>Create group</Button>
        </Pane.Actions>
        <Pane.Tabs>
          <Tabs.List aria-label="Groups">
            <For each={tabs}>
              {(tab) => (
                <Tabs.Tab
                  href={props.tabHref(tab.id)}
                  current={props.tab === tab.id}
                  count={tab.id === "joined" ? props.joinedCount : props.discoverCount}
                  onClick={(event: MouseEvent) => {
                    if (!props.onTabChange) return;
                    event.preventDefault();
                    props.onTabChange(tab.id);
                  }}
                >
                  {tab.label}
                </Tabs.Tab>
              )}
            </For>
          </Tabs.List>
        </Pane.Tabs>
      </Pane.Header>
      <Pane.Toolbar>
        <SearchField
          placeholder={discover() ? "Search public groups…" : "Search your groups…"}
          value={props.query}
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
        />
      </Pane.Toolbar>
      <p class={s.summary}>
        <span>
          {discover()
            ? "Public groups you haven’t joined. Open any group to read before joining."
            : "Public and private groups you’ve joined."}
        </span>
        <span class={s.total}>{count(props.groups.length)}</span>
      </p>
      <div class={s.headings} aria-hidden="true">
        <span class={s.headingGroup}>Group</span>
        <span>Visibility</span>
        <span>Members</span>
        <span />
        <Divider class={s.stitch} />
      </div>
      <Pane.Body inset="list">
        <Show
          when={props.groups.length > 0}
          fallback={
            <p class={s.empty}>
              {props.query
                ? "No groups match this search."
                : discover()
                  ? "You’ve joined every public group."
                  : "You haven’t joined any groups yet."}
            </p>
          }
        >
          <ul class={s.list} aria-label={discover() ? "Public groups" : "Your groups"}>
            <For each={props.groups}>
              {(group) => (
                <li class={s.row}>
                  <IconMarkChannel class={s.icon} />
                  <a
                    href={group.href}
                    class={s.name}
                    onClick={(event) => {
                      if (!props.onOpenGroup) return;
                      event.preventDefault();
                      props.onOpenGroup(group.id);
                    }}
                  >
                    {group.name}
                  </a>
                  <span class={s.visibility}>
                    <Badge>{group.visibility === "public" ? "Public" : "Private"}</Badge>
                  </span>
                  <span class={s.members}>
                    {group.memberCount === 1 ? "1 member" : `${group.memberCount} members`}
                  </span>
                  <span class={s.action}>
                    <Show
                      when={discover()}
                      fallback={
                        <span class={s.open} aria-hidden="true">
                          Open
                          <IconMarkOpen class={s.openIcon} />
                        </span>
                      }
                    >
                      <Button
                        disabled={props.joiningId === group.id}
                        aria-label={`Join ${group.name}`}
                        onClick={() => props.onJoin(group.id)}
                      >
                        Join
                      </Button>
                    </Show>
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Pane.Body>
    </Pane.Root>
  );
}
