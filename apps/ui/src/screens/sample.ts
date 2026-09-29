// Workshop data matching the Lunacy group screens. Not exported.
import type { MessageAuthor } from "../components/message/index.ts";
import type { PickerPerson } from "../components/member-picker/index.ts";
import type { SettingsMember, TaskPerson, TaskRow } from "./group/index.ts";
import type { TimelineEntry } from "./timeline/index.ts";
import type { HomeSidebarProps, WorkspaceNavigationProps } from "./workspace-navigation/index.ts";

export const people = {
  alex: { name: "Alex", initials: "AM", tone: "sand" },
  sara: { name: "Sara", tone: "clay" },
  oliver: { name: "Oliver", tone: "olive" },
  aj: { name: "AJ", tone: "ink" },
  graeme: { name: "Graeme", tone: "slate" },
  yumi: { name: "Yumi", tone: "lilac", agent: true },
  jordan: { name: "Jordan Mercier", initials: "JM", tone: "sage" },
} as const satisfies Record<string, MessageAuthor>;

export const groupEntries: readonly TimelineEntry[] = [
  { kind: "divider", id: "yesterday", label: "Yesterday" },
  {
    kind: "message",
    id: "m1",
    author: people.alex,
    time: "Yesterday",
    text: "The preview is ready for another look. I’ve linked the latest notes in the task.",
  },
  {
    kind: "message",
    id: "m2",
    author: people.sara,
    time: "Yesterday",
    text: "Looks good. I’ll keep an eye on the release this morning.",
  },
  { kind: "divider", id: "today", label: "Today" },
  { kind: "message", id: "m3", author: people.oliver, time: "9:41 AM", text: "morning all! ☕" },
  {
    kind: "message",
    id: "m4",
    author: people.sara,
    time: "9:44 AM",
    text: "deploy went out clean last night! 🎉",
    reactions: [{ emoji: "🔥", count: 3 }],
  },
  {
    kind: "message",
    id: "m5",
    author: people.aj,
    time: "10:02 AM",
    text: "found a bug. composer crashes when I paste an image from clipboard lol",
    thread: { replies: 4, people: [people.alex, people.yumi, people.sara] },
  },
  {
    kind: "message",
    id: "m6",
    author: people.graeme,
    time: "10:08 AM",
    text: "[@Caleb](member:caleb) Let’s grab some coffee",
    mentions: [{ id: "caleb", name: "Caleb" }],
  },
];

export const threadEntries: readonly TimelineEntry[] = [
  {
    kind: "message",
    id: "t0",
    author: people.aj,
    text: "found a bug. composer crashes when I paste an image from clipboard lol",
  },
  { kind: "divider", id: "replies", label: "4 replies", align: "start" },
  {
    kind: "message",
    id: "t1",
    author: people.alex,
    time: "10:03 AM",
    text: "uh oh — repro on mac or everywhere?",
  },
  {
    kind: "message",
    id: "t2",
    author: people.yumi,
    activity: "Checked codebase",
    text: "Reproduced on both — images over **5 MB** hit the crash. Filed it and tagged the composer team.",
    task: { key: "AND-214", title: "Composer paste crash", state: "open" },
  },
  {
    kind: "message",
    id: "t3",
    author: people.aj,
    time: "10:07 AM",
    text: "Thanks! I’ll attach the image to the task.",
  },
  {
    kind: "message",
    id: "t4",
    author: people.sara,
    time: "10:09 AM",
    text: "I can pick this up after the release check.",
  },
];

const noop = () => {};

export interface NavigationState {
  /** Joined groups, in sidebar order. */
  readonly groups: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly currentGroup?: string;
  readonly directory?: boolean;
  readonly threadOpen?: boolean;
  readonly onOpenGroup?: (id: string) => void;
  readonly onOpenDirectory?: (tab: "joined" | "discover") => void;
  readonly onCreateGroup?: () => void;
}

/** The rail and Home sidebar's sample props; pass them to both WorkspaceNavigation and HomeSidebar. */
export type NavigationSample = Omit<WorkspaceNavigationProps, "children"> & HomeSidebarProps;

export function navigation(state: NavigationState): NavigationSample {
  return {
    workspace: { name: "Mercier & Co" },
    account: people.jordan,
    homeHref: "#home",
    destination: "home",
    destinationHref: (destination) => `#${destination}`,
    settings: { href: "#settings" },
    inbox: { href: "#inbox" },
    triage: { href: "#triage", count: 5 },
    tasks: { href: "#tasks" },
    groupsDirectory: { href: "#groups", current: state.directory },
    groups: state.groups.map((group) => ({
      id: group.id,
      name: group.name,
      href: `#${group.id}`,
      current: !state.directory && state.currentGroup === group.id,
      threads:
        group.id === "general"
          ? [
              {
                id: "m5",
                title: "Composer paste crash",
                href: "#thread",
                state: "open" as const,
                current: state.threadOpen && !state.directory && state.currentGroup === "general",
              },
            ]
          : undefined,
    })),
    directMessages: [
      { id: "alex", name: "Alex Morgan", tone: "sand", href: "#alex" },
      { id: "yumi", name: "Yumi", tone: "lilac", href: "#yumi" },
    ],
    onSearch: noop,
    onSwitchWorkspace: noop,
    onOpenAccount: noop,
    onBrowseGroups: () => state.onOpenDirectory?.("discover"),
    onCreateGroup: () => state.onCreateGroup?.(),
    onNewMessage: noop,
  };
}

/** Groups in the workspace: joined ones first, then public groups to discover. */
export const workspaceGroups: ReadonlyArray<{
  readonly id: string;
  readonly name: string;
  readonly visibility: "public" | "private";
  readonly memberCount: number;
  readonly joined: boolean;
}> = [
  { id: "design", name: "design", visibility: "public", memberCount: 12, joined: true },
  { id: "engineering", name: "engineering", visibility: "private", memberCount: 9, joined: true },
  { id: "general", name: "general", visibility: "private", memberCount: 7, joined: true },
  { id: "product", name: "product", visibility: "public", memberCount: 8, joined: true },
  {
    id: "announcements",
    name: "announcements",
    visibility: "public",
    memberCount: 24,
    joined: false,
  },
  {
    id: "customer-feedback",
    name: "customer-feedback",
    visibility: "public",
    memberCount: 16,
    joined: false,
  },
  { id: "launches", name: "launches", visibility: "public", memberCount: 8, joined: false },
  { id: "platform", name: "platform", visibility: "public", memberCount: 11, joined: false },
  { id: "research", name: "research", visibility: "public", memberCount: 6, joined: false },
  { id: "watercooler", name: "watercooler", visibility: "public", memberCount: 19, joined: false },
];

const caleb = { name: "Caleb", tone: "sage" } as const;

export const launchesEntries: readonly TimelineEntry[] = [
  { kind: "divider", id: "today", label: "Today" },
  {
    kind: "message",
    id: "l1",
    author: people.sara,
    time: "9:10 AM",
    text: "Sharing the launch plan for next week. Please add questions here.",
    thread: { replies: 6, people: [people.alex, people.graeme, people.yumi] },
  },
  {
    kind: "message",
    id: "l2",
    author: people.alex,
    time: "9:18 AM",
    text: "Docs are ready for review. I’ve added the rollout checklist.",
  },
  {
    kind: "message",
    id: "l3",
    author: people.graeme,
    time: "9:26 AM",
    text: "I’ll coordinate the announcement after we confirm the date.",
  },
  {
    kind: "message",
    id: "l4",
    author: people.yumi,
    time: "9:32 AM",
    text: "I can help check the release notes when they’re ready.",
  },
  {
    kind: "message",
    id: "l5",
    author: caleb,
    time: "9:40 AM",
    text: "I’ll review the checklist this afternoon.",
  },
];

export const launchesThread: readonly TimelineEntry[] = [
  {
    kind: "message",
    id: "lt0",
    author: people.sara,
    time: "9:10 AM",
    text: "Sharing the launch plan for next week. Please add questions here.",
  },
  { kind: "divider", id: "replies", label: "6 replies", align: "start" },
  {
    kind: "message",
    id: "lt1",
    author: people.alex,
    time: "9:18 AM",
    text: "Docs are ready. I’ve added the rollout checklist.",
  },
  {
    kind: "message",
    id: "lt2",
    author: people.graeme,
    time: "9:26 AM",
    text: "I’ll coordinate the announcement.",
  },
  {
    kind: "message",
    id: "lt3",
    author: people.yumi,
    time: "9:32 AM",
    text: "I can review the release notes.",
  },
  {
    kind: "message",
    id: "lt4",
    author: people.oliver,
    time: "9:35 AM",
    text: "Support is covered for launch day.",
  },
  {
    kind: "message",
    id: "lt5",
    author: people.aj,
    time: "9:38 AM",
    text: "I’ll check the final build.",
  },
  {
    kind: "message",
    id: "lt6",
    author: caleb,
    time: "9:40 AM",
    text: "Reviewing the checklist this afternoon.",
  },
];

export const you: PickerPerson = {
  id: "you",
  name: "You",
  initials: "JM",
  tone: "sage",
  kind: "Person",
};

export const creationCandidates: readonly PickerPerson[] = [
  { id: "alex", name: "Alex Morgan", tone: "sand", kind: "Person" },
  { id: "caleb", name: "Caleb", tone: "sage", kind: "Person" },
  { id: "graeme", name: "Graeme", tone: "slate", kind: "Person" },
  { id: "oliver", name: "Oliver", tone: "olive", kind: "Person" },
  { id: "sara", name: "Sara", tone: "clay", kind: "Person" },
  { id: "yumi", name: "Yumi", tone: "lilac", kind: "Agent" },
];

export const taskPeople = [
  { id: "aj", name: "AJ", tone: "ink" },
  { id: "alex", name: "Alex", initials: "AM", tone: "sand" },
  { id: "graeme", name: "Graeme", tone: "slate" },
  { id: "oliver", name: "Oliver", tone: "olive" },
  { id: "sara", name: "Sara", tone: "clay" },
  { id: "yumi", name: "Yumi", tone: "lilac" },
] as const satisfies readonly TaskPerson[];

const person = (id: (typeof taskPeople)[number]["id"]) =>
  taskPeople.find((candidate) => candidate.id === id);

export const tasks: readonly TaskRow[] = [
  {
    key: "AND-214",
    title: "Composer paste crash",
    state: "progress",
    assignee: person("sara"),
    activity: "2m ago",
  },
  {
    key: "AND-218",
    title: "Fix invite email validation",
    state: "open",
    assignee: person("alex"),
    activity: "12m ago",
  },
  {
    key: "AND-220",
    title: "Add workspace switcher",
    state: "progress",
    assignee: person("yumi"),
    activity: "25m ago",
  },
  { key: "AND-219", title: "Review public group access", state: "triage", activity: "38m ago" },
  {
    key: "AND-212",
    title: "Restore draft after reload",
    state: "open",
    assignee: person("aj"),
    activity: "1h ago",
  },
  {
    key: "AND-217",
    title: "Improve attachment previews",
    state: "progress",
    assignee: person("alex"),
    activity: "2h ago",
  },
  {
    key: "AND-216",
    title: "Add keyboard navigation",
    state: "open",
    assignee: person("oliver"),
    activity: "3h ago",
  },
  { key: "AND-221", title: "Investigate missing mentions", state: "triage", activity: "4h ago" },
  {
    key: "AND-211",
    title: "Align thread header and composer",
    state: "done",
    assignee: person("sara"),
    activity: "Yesterday",
  },
  {
    key: "AND-209",
    title: "Add thread participant avatars",
    state: "done",
    assignee: person("yumi"),
    activity: "Yesterday",
  },
  {
    key: "AND-206",
    title: "Update notification preferences",
    state: "done",
    assignee: person("graeme"),
    activity: "2d ago",
  },
  {
    key: "AND-205",
    title: "Improve empty group state",
    state: "done",
    assignee: person("oliver"),
    activity: "3d ago",
  },
];

export const taskDescriptions: Record<string, string> = {
  "AND-214": "Handle clipboard images over 5 MB without crashing the composer.",
};

export const taskEntries: readonly TimelineEntry[] = [
  { kind: "event", id: "created", text: "AJ created this task · 10:06 AM" },
  {
    kind: "message",
    id: "k1",
    author: people.sara,
    time: "10:09 AM",
    text: "I can reproduce it. I’m checking the image size handling before the paste completes.",
  },
  {
    kind: "message",
    id: "k2",
    author: people.yumi,
    time: "10:12 AM",
    text: "The crash starts when the preview is generated. I’ve added the reproduction steps.",
  },
];

export const groupMembers: readonly SettingsMember[] = [
  { id: "aj", name: "AJ", tone: "ink", removable: true },
  { id: "alex", name: "Alex Morgan", tone: "sand", removable: true },
  { id: "caleb", name: "Caleb", tone: "sage", removable: true },
  { id: "graeme", name: "Graeme", tone: "slate", removable: true },
  { id: "oliver", name: "Oliver", tone: "olive", removable: true },
  { id: "sara", name: "Sara", tone: "clay", removable: true },
  { id: "yumi", name: "Yumi", tone: "lilac", agent: true, removable: true },
];

export const workspaceCandidates: readonly PickerPerson[] = [
  { id: "casey", name: "Casey Park", tone: "sage", kind: "Person" },
  { id: "morgan", name: "Morgan Lee", tone: "slate", kind: "Person" },
  { id: "riley", name: "Riley Chen", tone: "clay", kind: "Person" },
  { id: "taylor", name: "Taylor Reed", tone: "sand", kind: "Person" },
];
