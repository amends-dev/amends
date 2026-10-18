/**
 * The open workspace's store, as the app holds it: open while the person has a workspace open, over
 * the browser's services, and closed when they leave it or sign out, and its replica's counts, as
 * messages, while it is open.
 */

import { Identity } from "@amends-dev/core/identity"
import { WorkspaceId } from "@amends-dev/core/workspace"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as ManagedResource from "foldkit/managedResource"
import * as Subscription from "foldkit/subscription"
import * as Browser from "./browser.ts"
import { Message } from "./message.ts"
import { type Model, Page, StoreState } from "./model.ts"
import * as Store from "./sync/Store.ts"

export const StoreResource = ManagedResource.tag<Store.Store["Service"]>()("Store")

/** The store the model has open: whose, of which workspace, and on which host. */
const openStore = (model: Model): Option.Option<Store.Options> =>
  Page.matchOrElse(
    model.page,
    {
      SignedIn: ({ session, opened }) =>
        Option.map(opened, ({ workspace }) => ({
          apiUrl: model.apiUrl,
          token: session.token,
          humanId: session.account.id,
          workspaceId: workspace.id
        }))
    },
    () => Option.none()
  )

/** Whether the open workspace's store has opened. */
const isOpen = (model: Model): boolean =>
  Page.matchOrElse(
    model.page,
    {
      SignedIn: ({ opened }) =>
        Option.exists(opened, ({ store }) => StoreState.matchOrElse(store, { Open: () => true }, () => false))
    },
    () => false
  )

export const managedResources = ManagedResource.make<Model, Message>()((entry) => ({
  store: entry(
    Schema.Option(
      Schema.Struct({
        apiUrl: Schema.String,
        token: Schema.String,
        humanId: Identity.HumanId,
        workspaceId: WorkspaceId.WorkspaceId
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

export const subscriptions = Subscription.make<Model, Message, ManagedResource.ServiceOf<typeof StoreResource>>()(
  (entry) => ({
    replicaCounts: entry(
      { isOpen: Schema.Boolean },
      {
        modelToDependencies: (model) => ({ isOpen: isOpen(model) }),
        dependenciesToStream: ({ isOpen }) =>
          isOpen
            ? Stream.unwrap(
                StoreResource.get.pipe(
                  Effect.map((store) =>
                    store.counts.pipe(
                      Stream.map((counts) => Message.CountedRecords({ counts })),
                      Stream.catch(() =>
                        Stream.make(
                          Message.FailedReadStore({ error: "This browser could not read the workspace's copy." })
                        )
                      )
                    )
                  ),
                  Effect.catchTag("ResourceNotAvailable", () => Effect.succeed(Stream.empty))
                )
              )
            : Stream.empty
      }
    )
  })
)
