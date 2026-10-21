import { makeApplicationDefinition } from "foldkit"
import { Message } from "./message.ts"
import { Model } from "./model.ts"

export const ApplicationDefinition = makeApplicationDefinition({ Model, Message })
