import * as Application from 'foldkit/application'
import { makeDefinition as makeApplicationDefinition } from 'foldkit/application'

const makeFromNamespaceImport = () => {
  const ApplicationDefinition = Application.makeDefinition({ Model, Message })
  return ApplicationDefinition
}

const makeFromAliasedImport = () => {
  const ApplicationDefinition = makeApplicationDefinition({ Model, Message })
  return ApplicationDefinition
}

void makeFromNamespaceImport
void makeFromAliasedImport
