import { Option, pipe } from 'effect'
import { type Block } from 'foldkit'

import { DialogBlock } from '@foldkit/ui'

import { ApplicationDefinition } from '../definition'
import {
  ApiReferenceBlock,
  BlockPageBlock,
  ComingFromReactBlock,
  ExampleDetailBlock,
  PlaygroundBlock,
  UiBlock,
} from '../page'
import { ApplicationRoute } from '../route'
import { SearchBlock } from '../search'
import { SnippetCopyBlock } from '../snippetCopy'
import { SnippetDisclosureBlock } from '../snippetDisclosure'
import { selectThemePreference } from '../theme'
import { ThemeMenu } from '../view'
import { HomeBinding } from './home'

export const SearchBinding = ApplicationDefinition.bindChild(SearchBlock, {
  field: 'search',
})

export const SnippetCopyBinding = ApplicationDefinition.bindChild(
  SnippetCopyBlock,
  {
    field: 'snippetCopy',
  },
)

export const SnippetDisclosureBinding = ApplicationDefinition.bindChild(
  SnippetDisclosureBlock,
  {
    field: 'snippetDisclosure',
  },
)

export const ExampleDetailBinding = ApplicationDefinition.bindChild(
  ExampleDetailBlock,
  {
    field: 'exampleDetail',
  },
)

export const PlaygroundBinding = ApplicationDefinition.bindChild(
  PlaygroundBlock,
  {
    field: 'playground',
    init: {
      contextToArgs: ({ route }) =>
        pipe(
          route,
          Option.liftPredicate(ApplicationRoute.guards.Playground),
          Option.map(route => [route.exampleSlug]),
        ),
    },
  },
)

export const UiPagesBinding = ApplicationDefinition.bindChild(UiBlock, {
  field: 'uiPages',
  init: { contextToArgs: ({ today }) => [today] },
})

export const ApiReferenceBinding = ApplicationDefinition.bindChild(
  ApiReferenceBlock,
  {
    field: 'apiReference',
  },
)

export const ComingFromReactBinding = ApplicationDefinition.bindChild(
  ComingFromReactBlock,
  {
    field: 'comingFromReact',
  },
)

export const CoreBlockPageBinding = ApplicationDefinition.bindChild(
  BlockPageBlock,
  {
    field: 'coreBlockPage',
  },
)

const foldMobileMenuDialogOutMessage = DialogBlock.OutMessage.match({
  Opened: () => ApplicationDefinition.stepNoop(),
  Closed: () => ApplicationDefinition.stepNoop(),
  CompletedClose: () => ApplicationDefinition.stepNoop(),
})

export const MobileMenuDialogBinding = ApplicationDefinition.bindChild(
  DialogBlock,
  {
    field: 'mobileMenuDialog',
    outMessage: { fold: foldMobileMenuDialogOutMessage },
    init: { contextToArgs: () => [{ id: 'mobile-menu' }] },
  },
)

const foldThemeMenuOutMessage = ThemeMenu.ThemeMenuBlock.OutMessage.match({
  Selected: ({ value }) => selectThemePreference(value),
  Closed: () => ApplicationDefinition.stepNoop(),
})

export const ThemeMenuBinding = ApplicationDefinition.bindChild(
  ThemeMenu.ThemeMenuBlock,
  {
    field: 'themeMenu',
    outMessage: { fold: foldThemeMenuOutMessage },
    init: { contextToArgs: () => [{ id: 'theme-menu' }] },
  },
)

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [
    ApiReferenceBinding,
    ComingFromReactBinding,
    CoreBlockPageBinding,
    ExampleDetailBinding,
    HomeBinding,
    MobileMenuDialogBinding,
    PlaygroundBinding,
    SearchBinding,
    SnippetCopyBinding,
    SnippetDisclosureBinding,
    ThemeMenuBinding,
    UiPagesBinding,
  ],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
