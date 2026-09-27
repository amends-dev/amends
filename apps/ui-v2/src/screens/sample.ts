// Workshop data matching the Lunacy group screens. Not exported.
import type { MessageAuthor } from "../components/message/index.ts";
import type { PickerPerson } from "../components/member-picker/index.ts";
import type { SettingsMember, TaskPerson, TaskRow } from "./group/index.ts";
import type { TimelineEntry } from "./timeline/index.ts";
import type { WorkspaceNavigationProps } from "./workspace-navigation/index.ts";

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
    text: ["The preview is ready for another look. I’ve linked the latest notes in the task."],
  },
  {
    kind: "message",
    id: "m2",
    author: people.sara,
    time: "Yesterday",
    text: ["Looks good. I’ll keep an eye on the release this morning."],
  },
  { kind: "divider", id: "today", label: "Today" },
  { kind: "message", id: "m3", author: people.oliver, time: "9:41 AM", text: ["morning all! ☕"] },
  {
    kind: "message",
    id: "m4",
    author: people.sara,
    time: "9:44 AM",
    text: ["deploy went out clean last night! 🎉"],
    reactions: [{ emoji: "🔥", count: 3 }],
  },
  {
    kind: "message",
    id: "m5",
    author: people.aj,
    time: "10:02 AM",
    text: ["found a bug. composer crashes when I paste an image from clipboard lol"],
    thread: { replies: 4, people: [people.alex, people.yumi, people.sara] },
  },
  {
    kind: "message",
    id: "m6",
    author: people.graeme,
    time: "10:08 AM",
    text: [{ mention: "@Caleb" }, " Let’s grab some coffee"],
  },
];

export const threadEntries: readonly TimelineEntry[] = [
  {
    kind: "message",
    id: "t0",
    author: people.aj,
    text: ["found a bug. composer crashes when I paste an image from clipboard lol"],
  },
  { kind: "divider", id: "replies", label: "4 replies", align: "start" },
  {
    kind: "message",
    id: "t1",
    author: people.alex,
    time: "10:03 AM",
    text: ["uh oh — repro on mac or everywhere?"],
  },
  {
    kind: "message",
    id: "t2",
    author: people.yumi,
    activity: "Checked codebase",
    text: [
      "Reproduced on both — images over 5 MB hit the crash. Filed it and tagged the composer team.",
    ],
    task: { key: "AND-214", title: "Composer paste crash", state: "open" },
  },
  {
    kind: "message",
    id: "t3",
    author: people.aj,
    time: "10:07 AM",
    text: ["Thanks! I’ll attach the image to the task."],
  },
  {
    kind: "message",
    id: "t4",
    author: people.sara,
    time: "10:09 AM",
    text: ["I can pick this up after the release check."],
  },
];

const noop = () => {};

export function navigation(threadOpen: boolean): WorkspaceNavigationProps {
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
    groupsDirectory: { href: "#groups" },
    groups: [
      {
        id: "general",
        name: "general",
        href: "#general",
        current: true,
        threads: [
          {
            id: "m5",
            title: "Composer paste crash",
            href: "#thread",
            state: "open",
            current: threadOpen,
          },
        ],
      },
      { id: "design", name: "design", href: "#design" },
      { id: "engineering", name: "engineering", href: "#engineering" },
      { id: "product", name: "product", href: "#product" },
    ],
    directMessages: [
      { id: "alex", name: "Alex Morgan", tone: "sand", href: "#alex" },
      { id: "yumi", name: "Yumi", tone: "lilac", href: "#yumi" },
    ],
    onSearch: noop,
    onSwitchWorkspace: noop,
    onOpenAccount: noop,
    onBrowseGroups: noop,
    onCreateGroup: noop,
    onNewMessage: noop,
  };
}

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
    text: ["I can reproduce it. I’m checking the image size handling before the paste completes."],
  },
  {
    kind: "message",
    id: "k2",
    author: people.yumi,
    time: "10:12 AM",
    text: ["The crash starts when the preview is generated. I’ve added the reproduction steps."],
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
