import * as Application from 'foldkit/application'
import { makeDefinition as makeApplicationDefinition } from 'foldkit/application'

const WrongNamespaceImport = Application.makeDefinition({ Model, Message })
const WrongAliasedImport = makeApplicationDefinition({ Model, Message })

void WrongNamespaceImport
void WrongAliasedImport
