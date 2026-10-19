import { Effect, Option } from 'effect'
import {
  AST,
  Diagnostic,
  type ESTree,
  type Reference,
  Rule,
  RuleContext,
} from 'effect-oxlint'

import {
  firstStringArgument,
  indexReferences,
  isCallExpression,
  isIdentifier,
  isMemberExpression,
  isVariableDeclarator,
  resolveFoldkitApiPath,
  resolvedVariable,
  staticMemberPath,
} from '../guards.ts'

const isBlockFactoryCall = (
  node: ESTree.CallExpression,
  factoryName: 'makeDefinition' | 'makeNamespace',
  references: WeakMap<ESTree.Node, Reference> | undefined,
): boolean => {
  if (references === undefined) {
    return AST.isCallOf(node, 'Block', factoryName)
  }

  return Option.exists(resolveFoldkitApiPath(references, node.callee), path => {
    const [namespace, methodName, extraMember] = path

    return (
      namespace === 'Block' &&
      methodName === factoryName &&
      extraMember === undefined
    )
  })
}

const isApplicationDefinitionCall = (
  node: ESTree.CallExpression,
  references: WeakMap<ESTree.Node, Reference> | undefined,
): boolean => {
  if (references === undefined) {
    return (
      AST.isCallOf(node, 'Application', 'makeDefinition') ||
      isIdentifier(node.callee, 'makeApplicationDefinition')
    )
  }

  return Option.exists(resolveFoldkitApiPath(references, node.callee), path => {
    const [namespace, methodName, extraMember] = path

    return (
      (namespace === 'makeApplicationDefinition' && methodName === undefined) ||
      (namespace === 'Application' &&
        methodName === 'makeDefinition' &&
        extraMember === undefined)
    )
  })
}

type AuthoringStage = Readonly<{
  isApplication: boolean
  stage: 'Namespace' | 'Definition' | 'Composition'
  identity: string | undefined
}>

const authoringStage = (
  node: ESTree.CallExpression,
  references: WeakMap<ESTree.Node, Reference> | undefined,
  visited: ReadonlySet<ESTree.Node> = new Set(),
): AuthoringStage | undefined => {
  if (visited.has(node)) {
    return undefined
  }

  const isBlockNamespace = isBlockFactoryCall(node, 'makeNamespace', references)
  const isBlockDefinition = isBlockFactoryCall(
    node,
    'makeDefinition',
    references,
  )
  const isApplication = isApplicationDefinitionCall(node, references)
  if (isBlockNamespace || isBlockDefinition || isApplication) {
    return {
      isApplication,
      stage: isBlockNamespace ? 'Namespace' : 'Definition',
      identity: firstStringArgument(node)?.value,
    }
  }

  if (
    !isMemberExpression(node.callee) ||
    node.callee.computed ||
    !isIdentifier(node.callee.property)
  ) {
    return undefined
  }

  const methodName = node.callee.property.name
  if (methodName !== 'makeDefinition' && methodName !== 'makeComposition') {
    return undefined
  }

  const receiver = node.callee.object
  const precedingStage = (() => {
    if (isCallExpression(receiver)) {
      return authoringStage(receiver, references, new Set([...visited, node]))
    }

    if (references === undefined) {
      return undefined
    }

    const path = staticMemberPath(receiver)
    if (Option.isNone(path)) {
      return undefined
    }

    const variable = resolvedVariable(references, path.value.root)
    if (Option.isSome(variable)) {
      for (const definition of variable.value.defs) {
        if (
          definition.type === 'Variable' &&
          isVariableDeclarator(definition.node) &&
          isCallExpression(definition.node.init)
        ) {
          return authoringStage(
            definition.node.init,
            references,
            new Set([...visited, node]),
          )
        }
      }
    }

    return undefined
  })()
  if (precedingStage === undefined) {
    return undefined
  }

  if (
    (methodName === 'makeDefinition' &&
      (precedingStage.isApplication || precedingStage.stage !== 'Namespace')) ||
    (methodName === 'makeComposition' && precedingStage.stage !== 'Definition')
  ) {
    return undefined
  }

  return {
    ...precedingStage,
    stage: methodName === 'makeDefinition' ? 'Definition' : 'Composition',
  }
}

/** Requires Block and Application bindings to use their authoring stage suffix. */
export const blockNameMatchesVariable = Rule.define({
  name: 'block-name-matches-variable',
  meta: Rule.meta({
    type: 'suggestion',
    description:
      'Name Block and Application bindings for their authoring stage.',
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const scopes = ctx.sourceCode.scopeManager?.scopes
    const references =
      scopes === undefined ? undefined : indexReferences(scopes)

    return {
      VariableDeclarator: (node: ESTree.Node) => {
        if (!isVariableDeclarator(node) || !isIdentifier(node.id)) {
          return Effect.void
        }

        const init = node.init
        if (!isCallExpression(init)) {
          return Effect.void
        }

        const stage = authoringStage(init, references)
        if (stage === undefined) {
          return Effect.void
        }

        if (stage.isApplication) {
          const expectedName =
            stage.stage === 'Composition'
              ? 'ApplicationComposition'
              : 'ApplicationDefinition'
          if (node.id.name === expectedName) {
            return Effect.void
          }

          return ctx.report(
            Diagnostic.make({
              node: node.id,
              message: `Application identifier "${node.id.name}" must be "${expectedName}" at this authoring stage.`,
            }),
          )
        }

        const identity = stage.identity
        if (identity === undefined) {
          return Effect.void
        }

        const expectedName = `${identity}${stage.stage}`
        const isValidName = node.id.name === expectedName
        if (isValidName) {
          return Effect.void
        }

        return ctx.report(
          Diagnostic.make({
            node: node.id,
            message: `Block ${stage.stage} identifier "${node.id.name}" must be "${expectedName}".`,
          }),
        )
      },
    }
  },
})
