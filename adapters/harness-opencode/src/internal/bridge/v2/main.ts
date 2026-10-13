/**
 * The bridge program of the opencode 2 agent, which a host launches in its sandbox, over opencode
 * 2's session API, as `BunBridge.runProgram` runs it.
 */

import * as BunBridge from "../BunBridge.ts"
import { makeCreateSession } from "./Session.ts"

BunBridge.runProgram("opencode2", import.meta.dirname, makeCreateSession)
