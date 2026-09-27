// Workshop data matching the Lunacy group screens. Not exported.
import type { MessageAuthor } from "../components/message/index.ts";
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
