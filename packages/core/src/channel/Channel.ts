/**
 * A channel is a configured external communication point: a connection whose integration gives
 * channels, as `@amends-dev/connection`'s `ChannelTransport` describes them, and one destination
 * group, where each conversation the channel receives becomes a thread. Changing the destination
 * affects new conversations only: a bound thread stays where it is. `ChannelService` is the
 * operations; `ChannelIntake` takes in what a channel receives, and deliveries carry replies back
 * out.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Connection from "../connection/Connection.ts";
import * as GroupId from "../group/GroupId.ts";
import * as Text from "../text/Text.ts";
import * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as MemberId from "../workspace/MemberId.ts";
import * as ChannelId from "./ChannelId.ts";

/**
 * Names a channel; `ChannelId.Id`, where models that only refer to channels import it from.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = ChannelId.Id;

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = ChannelId.Id;

/**
 * A channel's name as recorded; names chosen now are `NewName`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Name = Schema.Trimmed.check(Schema.isMinLength(1));

/**
 * @category schemas
 * @since 0.1.0
 */
export type Name = typeof Name.Type;

/**
 * A name chosen for a channel: 1 to 80 characters, without hidden ones.
 *
 * @category schemas
 * @since 0.1.0
 */
export const NewName = Name.check(Schema.isMaxLength(Text.nameLength), Text.isName);

/**
 * A removed channel's record stays, so that retrying the request that created it finds it, and
 * so that the threads it bound keep naming it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Status = Schema.Literals(["active", "removed"]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type Status = typeof Status.Type;

/**
 * A channel as created and since redirected or removed.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  /** The connection whose transport receives the channel's events and posts its replies. */
  connectionId: Connection.Id,
  /** The destination: the group a new conversation becomes a thread in. */
  groupId: GroupId.Id,
  name: Name,
  /** Whether a new conversation opens as a task in triage, or as a conversation alone. */
  opensTasks: Schema.Boolean,
  status: Status,
  createdBy: MemberId.Id,
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
 * A new channel: its connection, its destination, what to call it, and whether it opens tasks.
 *
 * @category options
 * @since 0.1.0
 */
export const CreateInput = Schema.Struct({
  connectionId: Connection.Id,
  groupId: GroupId.Id,
  name: NewName,
  opensTasks: Schema.Boolean,
});

/**
 * @category options
 * @since 0.1.0
 */
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

/**
 * A new destination for a channel's conversations to come.
 *
 * @category options
 * @since 0.1.0
 */
export const RedirectInput = Schema.Struct({ channelId: Id, groupId: GroupId.Id });

/**
 * @category options
 * @since 0.1.0
 */
export interface RedirectInput extends Schema.Schema.Type<typeof RedirectInput> {}

/**
 * What redirecting records: the new destination.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Redirected = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  channelId: Id,
  groupId: GroupId.Id,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Redirected extends Schema.Schema.Type<typeof Redirected> {}

/**
 * A channel, as a fact that records no more of it names it: removed.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Reference = Schema.Struct({ workspaceId: WorkspaceId.Id, channelId: Id });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Reference extends Schema.Schema.Type<typeof Reference> {}
