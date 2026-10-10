import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { Connection } from "../src/connection/connection.ts";
import { Group } from "../src/group/group.ts";
import { ThreadMessage } from "../src/thread/ThreadMessage.ts";
import { Member } from "../src/workspace/member/member.ts";
import { Workspace } from "../src/workspace/workspace.ts";

const names = [Group.NewName, Workspace.NewName, Member.NewName, Connection.NewName];
// Names people type in any script, with emoji joined by zero-width joiners.
const readable = [
  "Ada Lovelace",
  "release-planning",
  "مريم",
  "设计 团队",
  "👩‍💻 Studio",
  "x".repeat(80),
];
// Each can make one name read as another, or cannot be stored as given.
const hidden = [
  "a\u0000b",
  "bell\u0007",
  "two\nlines",
  "a‮b",
  "⁦isolated⁩",
  "Ada​",
  "﻿Ada",
  "lone \uD800 half",
  "\uDC00trailing",
];

describe("names chosen now", () => {
  it.each(readable)("accept %j", (name) => {
    for (const schema of names) expect(Schema.is(schema)(name)).toBe(true);
  });
  it.each(hidden)("reject %j", (name) => {
    for (const schema of names) expect(Schema.is(schema)(name)).toBe(false);
  });
  it("reject names past 80 characters, blank ones, and surrounding space", () => {
    for (const schema of names)
      for (const name of ["x".repeat(81), "", " Ada"]) expect(Schema.is(schema)(name)).toBe(false);
  });
  it("leave recorded names readable, whatever they were given before", () => {
    for (const name of ["x".repeat(500), "a‮b", "Ada​"]) {
      expect(Schema.is(Group.Name)(name)).toBe(true);
      expect(Schema.is(Workspace.Name)(name)).toBe(true);
    }
  });
});

describe("message text", () => {
  it("keeps layout and direction marks people write", () => {
    for (const text of ["line one\n\tindented", "مرحبا ‏world", "👩‍💻"])
      expect(Schema.is(ThreadMessage.Text)(text)).toBe(true);
  });
  it("rejects what storage cannot keep as given", () => {
    for (const text of ["a\u0000b", "lone \uD800 half"])
      expect(Schema.is(ThreadMessage.Text)(text)).toBe(false);
  });
});
