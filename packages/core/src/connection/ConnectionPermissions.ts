/**
 * The actions on connections that need a grant: creating one in the workspace, and reading,
 * managing, and using each one. Members read and use connections; administrators and the owner
 * create and manage them. `ConnectionService` checks them, and agent and channel operations check
 * `Read` and `Use` on the connections they are given.
 *
 * @since 0.1.0
 */

import * as Permission from "../authorization/Permission.ts"

/**
 * Create a connection in the workspace, which gives the workspace access to an external system.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Create = Permission.make("connection.create", {
  targetKind: "Workspace",
  builtinTier: "administrator"
})

/**
 * Seeing a connection: its name, integration, settings, and readiness, never its key.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Read = Permission.make("connection.read", {
  targetKind: "Connection",
  builtinTier: "member"
})

/**
 * Renaming, configuring, replacing the key of, checking, and removing a connection. Checking sends
 * the connection's key to its system, so it is managing rather than reading.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Manage = Permission.make("connection.manage", {
  targetKind: "Connection",
  builtinTier: "administrator"
})

/**
 * Giving a connection to what runs on it, as to an agent, which then reaches the connection's
 * system with its key.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Use = Permission.make("connection.use", {
  targetKind: "Connection",
  builtinTier: "member"
})
