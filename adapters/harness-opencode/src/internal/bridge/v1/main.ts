/**
 * The bridge program of the opencode agent, which a host launches in its sandbox, over opencode 1's
 * session API, as `BunBridge.runProgram` runs it.
 */

import * as BunBridge from "../BunBridge.ts"
import { makeCreateSession } from "./Session.ts"

BunBridge.runProgram("opencode", import.meta.dirname, makeCreateSession)
