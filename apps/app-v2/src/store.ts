/**
 * The open workspace's store, as the app holds it: open while the person has a workspace open, over
 * the browser's services, and closed when they leave it or sign out; what its replica holds, as
 * messages, while it is open, the open group's threads and the open thread's messages among them;
 * and the actions the person writes to it.
 */

import type { CoreError } from "@amends-dev/core/error"
import { Group, GroupId } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Thread, ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Command from "foldkit/command"
import * as ManagedResource from "foldkit/managedResource"
import * as Subscription from "foldkit/subscription"
import * as Browser from "./browser.ts"
import { Message } from "./message.ts"
import { type ActionItem, type Model, type Opened, Page, StoreState } from "./model.ts"
import * as Store from "./sync/Store.ts"

export const StoreResource = ManagedResource.tag<Store.Store["Service"]>()("Store")

/** The workspace the person has open, if any. */
const openedIn = (model: Model): Option.Option<Opened> =>
  Page.matchOrElse(model.page, { SignedIn: ({ opened }) => opened }, () => Option.none())

/** The store the model has open: whose, of which workspace as which member, and on which host. */
const openStore = (model: Model): Option.Option<Store.Options> =>
  Page.matchOrElse(
    model.page,
    {
      SignedIn: ({ session, opened }) =>
        Option.map(opened, ({ workspace, memberId }) => ({
          apiUrl: model.apiUrl,
          token: session.token,
          humanId: session.account.id,
          workspaceId: workspace.id,
          memberId
        }))
    },
    () => Option.none()
  )

/** The open workspace, once its store has opened. */
const openWorkspace = (model: Model): Option.Option<Opened> =>
  Option.filter(openedIn(model), ({ store }) => StoreState.matchOrElse(store, { Open: () => true }, () => false))

export const managedResources = ManagedResource.make<Model, Message>()((entry) => ({
  store: entry(
    Schema.Option(
      Schema.Struct({
        apiUrl: Schema.String,
        token: Schema.String,
        humanId: Identity.HumanId,
        workspaceId: WorkspaceId.WorkspaceId,
        memberId: MemberId.MemberId
      })
    ),
    {
      resource: StoreResource,
      modelToMaybeRequirements: openStore,
      acquire: (options) =>
        Layer.build(Store.layer(options).pipe(Layer.provide(Browser.layer))).pipe(Effect.map(Context.get(Store.Store))),
      // The store closes with the scope it was acquired in.
      release: () => Effect.void,
      onAcquired: () => Message.AcquiredStore(),
      onReleased: () => Message.ReleasedStore(),
      onAcquireError: () => Message.FailedAcquireStore({ error: "This browser could not open the workspace." })
    }
  )
}))

const unreadable = Message.FailedReadStore({ error: "This browser could not read the workspace's copy." })

/** What `read` makes of the open store, as messages, while one is open. */
const fromStore = (read: (store: Store.Store["Service"]) => Stream.Stream<Message, unknown>) =>
  Stream.unwrap(
    StoreResource.get.pipe(
      Effect.map((store) => read(store).pipe(Stream.catch(() => Stream.make(unreadable)))),
      Effect.catchTag("ResourceNotAvailable", () => Effect.succeed(Stream.empty))
    )
  )

const workspace = ReplicaRecord.Place.cases.Workspace.make({})
const byPublished = Order.mapInput(DateTime.Order, (message: ThreadMessage.ThreadMessage) => message.publishedAt)
const byName = Order.mapInput(Order.String, (group: Group.Group) => (Group.isGeneral(group) ? "" : nameOf(group)))

/** A group's name: a team's own, or a direct group's members, as their IDs until names are read. */
const nameOf = (group: Group.Group): string => ("name" in group ? group.name : group.memberIds.join(", "))

/** What each action does, as the person reads it. */
const whatEach: Readonly<Record<string, string>> = {
  ThreadStarted: "start a thread",
  ThreadMessagePosted: "post a reply"
}

/** An action as the person reads it: what it does, the text it carries, and why it was refused. */
const describe = (action: Store.ActionView): ActionItem => ({
  key: action.key,
  what: whatEach[action.tag] ?? action.tag,
  text:
    Predicate.hasProperty(action.payload, "text") && Predicate.isString(action.payload.text)
      ? Option.some(action.payload.text)
      : Option.none(),
  rejection: Option.map(action.rejection, (error: CoreError.Rejection) => error.message)
})

export const subscriptions = Subscription.make<Model, Message, ManagedResource.ServiceOf<typeof StoreResource>>()(
  (entry) => ({
    workspace: entry(
      { isOpen: Schema.Boolean },
      {
        modelToDependencies: (model) => ({ isOpen: Option.isSome(openWorkspace(model)) }),
        dependenciesToStream: ({ isOpen }) =>
          isOpen
            ? fromStore((store) =>
                Stream.mergeAll(
                  [
                    Stream.map(store.list("Group", workspace), (groups): Message =>
                      Message.GotGroups({
                        groups: Array.sort(
                          groups.map(({ record }) => record.value),
                          byName
                        )
                      })
                    ),
                    Stream.map(store.list("Member", workspace), (members): Message =>
                      Message.GotMembers({ members: members.map(({ record }) => record.value) })
                    ),
                    Stream.map(store.actions, (actions): Message =>
                      Message.GotActions({ actions: actions.map(describe) })
                    )
                  ],
                  { concurrency: "unbounded" }
                )
              )
            : Stream.empty
      }
    ),
    group: entry(
      { groupId: Schema.Option(GroupId.GroupId) },
      {
        modelToDependencies: (model) => ({
          groupId: Option.flatMap(openWorkspace(model), ({ group }) => Option.map(group, ({ groupId }) => groupId))
        }),
        dependenciesToStream: ({ groupId }) =>
          Option.match(groupId, {
            onNone: () => Stream.empty,
            onSome: (groupId) =>
              fromStore((store) =>
                Stream.map(store.threads(groupId), (threads) =>
                  Message.GotThreads({
                    groupId,
                    threads: threads.map(({ thread, opening }) => ({
                      thread: thread.record.value,
                      opening,
                      pending: thread.pending
                    }))
                  })
                )
              )
          })
      }
    ),
    thread: entry(
      { threadId: Schema.Option(ThreadId.ThreadId) },
      {
        modelToDependencies: (model) => ({
          threadId: Option.flatMap(openWorkspace(model), ({ group }) =>
            Option.flatMap(group, ({ thread }) => Option.map(thread, ({ threadId }) => threadId))
          )
        }),
        dependenciesToStream: ({ threadId }) =>
          Option.match(threadId, {
            onNone: () => Stream.empty,
            onSome: (threadId) =>
              fromStore((store) =>
                Stream.map(
                  store.list("ThreadMessage", ReplicaRecord.Place.cases.Thread.make({ threadId })),
                  (messages) =>
                    Message.GotMessages({
                      threadId,
                      messages: Array.sort(
                        messages.map(({ record, pending }) => ({ message: record.value, pending })),
                        Order.mapInput(
                          byPublished,
                          ({ message }: { readonly message: ThreadMessage.ThreadMessage }) => message
                        )
                      )
                    })
                )
              )
          })
      }
    )
  })
)

const unwritable = (error: string) => Message.FailedWriteAction({ error })

/** Write an action to the open store, as `write` does. */
const toStore = (write: (store: Store.Store["Service"]) => Effect.Effect<unknown, unknown>) =>
  StoreResource.get.pipe(
    Effect.matchEffect({
      onFailure: () => Effect.succeed(unwritable("The workspace is not open.")),
      onSuccess: (store) =>
        write(store).pipe(
          Effect.as(Message.WroteAction()),
          Effect.catchCause(() => Effect.succeed(unwritable("This browser could not keep that. Try again.")))
        )
    })
  )

/** Start a thread in `groupId` with `text` as its opening message. */
export const StartThread = Command.define("StartThread", {
  args: { groupId: GroupId.GroupId, text: Schema.String },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: ({ groupId, text }) =>
    Schema.decodeEffect(Thread.StartInGroupInput)({ groupId, text, mentions: [] }).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("A thread needs an opening message.")),
        onSuccess: (input) => toStore((store) => store.write("ThreadStarted", input))
      })
    )
})

/** Reply in `threadId` with `text`. */
export const PostReply = Command.define("PostReply", {
  args: { threadId: ThreadId.ThreadId, text: Schema.String },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  execute: ({ threadId, text }) =>
    Schema.decodeEffect(ThreadMessage.PublishInput)({ threadId, text, mentions: [] }).pipe(
      Effect.matchEffect({
        onFailure: () => Effect.succeed(unwritable("A reply needs some text.")),
        onSuccess: (input) => toStore((store) => store.write("ThreadMessagePosted", input))
      })
    )
})

/** Forget a refused action, once the person has seen why. */
export const Dismiss = Command.define("Dismiss", {
  args: { key: Schema.String },
  messages: [Message.CompletedDismiss],
  execute: ({ key }) =>
    StoreResource.get.pipe(
      Effect.flatMap((store) => store.dismiss(key)),
      Effect.ignore,
      Effect.as(Message.CompletedDismiss())
    )
})
