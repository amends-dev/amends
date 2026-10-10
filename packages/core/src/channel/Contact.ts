/**
 * A contact is a person outside the workspace a channel heard from: one row per channel and
 * external user, named by what the external system calls them. A contact takes part in the threads
 * their conversations became, as the author of what they wrote and the recipient of what is replied,
 * without any access to the workspace. One person on two channels is two contacts; linking them is
 * open.
 *
 * @since 0.1.0
 */
import { ChannelTransport } from "@amends-dev/channel";
import { Schema } from "effect";
import { Identity } from "../identity/identity.ts";
import { Text } from "../text/text.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { ChannelId } from "./ChannelId.ts";

/**
 * Names a contact; `Identity.ContactId`, derived from the channel and the external user, so that
 * the same person on the same channel is one contact however often they write.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = Identity.ContactId;

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = Identity.ContactId;

/**
 * What a contact is called, as the external system calls them: 1 to 200 characters, without
 * surrounding space, which storage keeps as given.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Name = Schema.Trimmed.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(200),
  Text.isStorable,
);

/**
 * @category schemas
 * @since 0.1.0
 */
export type Name = typeof Name.Type;

/**
 * The name a contact takes from what the external system calls the sender: what remains of it
 * within a name, or "Someone" when nothing does.
 *
 * @category utils
 * @since 0.1.0
 */
export const nameOf = (sender: string): Name => {
  const kept = sender
    .replaceAll("\u0000", "")
    .replace(/\p{Cs}/gu, "")
    .trim()
    .slice(0, 200)
    .trim();
  return Name.make(kept === "" ? "Someone" : kept);
};

/**
 * A contact as first heard from, and as since renamed.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  channelId: ChannelId.Id,
  /** The external system's id for the person. */
  externalId: ChannelTransport.ExternalId,
  name: Name,
  createdAt: Schema.DateTimeUtcFromString,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Record extends Schema.Schema.Type<typeof Record> {}

/**
 * The record with some fields changed.
 *
 * @category utils
 * @since 0.1.0
 */
export const change = (record: Record, changes: Partial<Record>): Record =>
  Object.assign({}, record, changes);

/**
 * What renaming records: the name the external system now gives the person.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Renamed = Schema.Struct({ workspaceId: WorkspaceId.Id, contactId: Id, name: Name });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Renamed extends Schema.Schema.Type<typeof Renamed> {}

export * as Contact from "./Contact.ts";
