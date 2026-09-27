import { afterEach, expect, it } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { Theme } from "../src/foundations/theme/index.ts";
import { Shell } from "../src/patterns/shell/index.ts";
import { GroupSettings, type SettingsMember } from "../src/screens/group/index.ts";
import { InboxPane, type InboxItem } from "../src/screens/inbox/index.ts";
import { WorkspacePicker, type PickerWorkspace } from "../src/screens/workspaces/index.ts";

afterEach(cleanup);

const workspace = (id: string, name: string): PickerWorkspace => ({
  id,
  name,
  memberCount: 2,
  href: `#${id}`,
});

it("drops a workspace row that disappears, keeping the others", () => {
  const [workspaces, setWorkspaces] = createSignal([
    workspace("one", "Studio"),
    workspace("two", "Atelier"),
  ]);
  render(() => (
    <Theme mode="light">
      <WorkspacePicker
        homeHref="#"
        account={{ identity: "ada@example.test", onSignOut: () => {} }}
        workspaces={workspaces()}
        invitations={[]}
        onAccept={() => {}}
        onCreateWorkspace={() => {}}
      />
    </Theme>
  ));
  const kept = screen.getByRole("link", { name: "Studio" });
  // Removed from Atelier elsewhere: its row goes, and cleaning it up must not read its item.
  expect(() => setWorkspaces([workspace("one", "Studio")])).not.toThrow();
  expect(screen.queryByRole("link", { name: "Atelier" })).toBeNull();
  expect(screen.getByRole("link", { name: "Studio" })).toBe(kept);
});

it("keeps each inbox row, and the focus in it, when the inbox changes", () => {
  const at = new Date();
  const item = (id: string, unread: boolean): InboxItem => ({
    id,
    at,
    unread,
    reason: "reply",
    author: { name: id === "a" ? "Sara" : "Alex" },
    place: { name: "general", direct: false },
    text: ["Ready for another look."],
    href: `#${id}`,
  });
  const [items, setItems] = createSignal([item("a", true), item("b", true)]);
  render(() => (
    <Theme mode="light">
      <Shell.Root>
        <Shell.Main>
          <InboxPane
            workspaceName="Studio"
            tab="all"
            tabHref={() => "#"}
            items={items()}
            onOpen={() => {}}
          />
        </Shell.Main>
      </Shell.Root>
    </Theme>
  ));
  const link = screen.getByRole("link", { name: "Sara replied" });
  link.focus();
  // Opening it marks it seen: every item and day is rebuilt, but the row stays.
  setItems([item("a", false), item("b", true)]);
  expect(screen.getByRole("link", { name: "Sara replied" })).toBe(link);
  expect(document.activeElement).toBe(link);
});

it("keeps the other members' rows when one is removed from a group", () => {
  const person = (id: string, name: string): SettingsMember => ({ id, name, removable: true });
  const [members, setMembers] = createSignal([person("ada", "Ada"), person("bea", "Bea")]);
  render(() => (
    <Theme mode="light">
      <GroupSettings
        open
        onClose={() => {}}
        groupName="design"
        tab="members"
        onTabChange={() => {}}
        name="design"
        onNameChange={() => {}}
        visibility="private"
        onVisibilityChange={() => {}}
        changed={false}
        onSave={() => {}}
        member
        onLeave={() => {}}
        members={members()}
        onRemove={() => {}}
        candidates={[]}
        selected={[]}
        onSelectedChange={() => {}}
        onAdd={() => {}}
      />
    </Theme>
  ));
  const next = screen.getByRole("button", { name: "Remove Bea" });
  setMembers([person("bea", "Bea")]);
  expect(screen.getByRole("button", { name: "Remove Bea" })).toBe(next);
});
