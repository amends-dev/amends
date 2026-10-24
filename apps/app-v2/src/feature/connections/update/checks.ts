/** Connection health checks and their request state. */

import type { Connection as ConnectionContract } from "@amends-dev/connection"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { findConnection } from "../../../data/connections.ts"
import { CheckConnection } from "../command.ts"
import { Check, type CheckItem, ConnectionsDefinition, mayManage, type Model } from "../definition.ts"

/** `checks` with the check of `connectionId` as `check`, in place of the last one. */
export const withCheck = (
  checks: ReadonlyArray<CheckItem>,
  connectionId: ConnectionContract.ConnectionId,
  check: Check
): ReadonlyArray<CheckItem> => [...checks.filter((item) => item.connectionId !== connectionId), { connectionId, check }]

/** Whether a check of `connectionId` is under way. */
const isChecking = (model: Model, connectionId: ConnectionContract.ConnectionId): boolean =>
  model.checks.some((item) => item.connectionId === connectionId && Check.isAnyOf(["Checking"])(item.check))

/** Check `connectionId` with its system, unless that is under way or the person may not manage it. */
export const checkStep = (connectionId: ConnectionContract.ConnectionId) =>
  ConnectionsDefinition.makeStep((model: Model) =>
    Option.exists(findConnection(model, connectionId), (item) => mayManage(model, item)) &&
    !isChecking(model, connectionId)
      ? {
          model: modifyFields(model, { checks: (checks) => withCheck(checks, connectionId, Check.Checking()) }),
          commands: [CheckConnection({ workspaceId: model.workspaceId, connectionId })]
        }
      : { model }
  )
