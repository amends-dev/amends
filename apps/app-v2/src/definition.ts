import { Block } from "foldkit"
import { Message } from "./message.ts"
import { Model } from "./model.ts"

export const ApplicationDefinition = Block.makeDefinition("Application", { Model, Message })
