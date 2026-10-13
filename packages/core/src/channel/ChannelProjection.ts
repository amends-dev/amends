/**
 * Keeps the read models of channels, bindings, and contacts, `ChannelStore`, `ChannelBindingStore`,
 * and `ContactStore`: each created record is inserted as its fact says, and each change applied to
 * the row from the fact alone, so the rows rebuild to the same state from the journal.
 *
 * @since 0.1.0
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Projection from "../journal/Projection.ts";
import * as Channel from "./Channel.ts";
import * as ChannelBindingStore from "./ChannelBindingStore.ts";
import * as ChannelFacts from "./ChannelFacts.ts";
import * as ChannelStore from "./ChannelStore.ts";
import * as Contact from "./Contact.ts";
import * as ContactStore from "./ContactStore.ts";

/** Change the stored channel a fact names, as `changes` says. */
const updateChannel = Effect.fnUntraced(function* (
  channelId: Channel.Id,
  changes: Partial<Channel.Channel>,
) {
  const channelStore = yield* ChannelStore.ChannelStore;
  const found = yield* channelStore.get(channelId);
  if (Option.isNone(found)) return yield* Effect.die("A changed channel is missing");
  yield* channelStore.update(Channel.change(found.value, changes));
});

/**
 * Inserts each channel, binding, and contact, and applies each change to a channel or a contact.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("channel", { version: 1 })
  .on(
    ChannelFacts.Created,
    Effect.fn("ChannelProjection.created")(function* ({ payload }) {
      const channelStore = yield* ChannelStore.ChannelStore;
      yield* channelStore.insert(payload);
    }),
  )
  .on(
    ChannelFacts.Redirected,
    Effect.fn("ChannelProjection.redirected")(function* ({ payload }) {
      yield* updateChannel(payload.channelId, { groupId: payload.groupId });
    }),
  )
  .on(
    ChannelFacts.Removed,
    Effect.fn("ChannelProjection.removed")(function* ({ payload }) {
      yield* updateChannel(payload.channelId, { status: "removed" });
    }),
  )
  .on(
    ChannelFacts.Bound,
    Effect.fn("ChannelProjection.bound")(function* ({ payload }) {
      const channelBindingStore = yield* ChannelBindingStore.ChannelBindingStore;
      yield* channelBindingStore.insert(payload);
    }),
  )
  .on(
    ChannelFacts.ContactCreated,
    Effect.fn("ChannelProjection.contactCreated")(function* ({ payload }) {
      const contactStore = yield* ContactStore.ContactStore;
      yield* contactStore.insert(payload);
    }),
  )
  .on(
    ChannelFacts.ContactRenamed,
    Effect.fn("ChannelProjection.contactRenamed")(function* ({ payload }) {
      const contactStore = yield* ContactStore.ContactStore;
      const found = yield* contactStore.get(payload.contactId);
      if (Option.isNone(found)) return yield* Effect.die("A renamed contact is missing");
      yield* contactStore.update(Contact.change(found.value, { name: payload.name }));
    }),
  );
