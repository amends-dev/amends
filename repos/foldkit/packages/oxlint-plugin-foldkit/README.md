# @foldkit/oxlint-plugin

Oxlint rules for Foldkit applications. Extend `recommended.json` for the full supported convention set, or `all.json` for every current rule. Both presets enable `foldkit/block-name-matches-variable` at error severity.

`foldkit/no-manual-composition-routing` keeps child delivery out of authored Composition updates. Current `bindChild` configurations derive generated envelopes from the completed child Block; they need no parent `Got*` variant or Message mapper. The rule reports every legacy `parentMessage`, `toParentMessage`, or `fromParentMessage` property and manual `Got*` handling during migration. The presets disable it in tests.

The published `got-block-message-name`, `got-prefix-requires-block-payload`, `got-wrapper-carries-only-routing`, and `wrap-child-output-in-got-message` rule IDs remain available for projects checking pre-generated-delivery source. Both presets disable them because current Foldkit applications do not author child delivery wrappers.

`foldkit/no-direct-block-state-update` recognizes generated direct, accessor, exact-keyed, wrapped-keyed, and general-keyed Bindings without requiring authored Message mapping properties. It protects child-owned Model fields through registered Binding ownership. `foldkit/no-child-message-construction-in-root` separately prevents a parent from constructing child-owned Messages; parent-driven transitions use named Binding operations.

`foldkit/block-name-matches-variable` requires direct literal Block authoring declarations to use the suffix for their stage. Definitions use `<BlockId>Definition`, Namespaces use `<BlockId>Namespace`, and Compositions derived in the same file use `<BlockId>Composition`:

```ts
const PeopleDefinition = Block.makeDefinition('People', { Model, Message })
const PeopleComposition = PeopleDefinition.makeComposition()

const PickerNamespace = Block.makeNamespace('Picker')
const PickerDefinition = PickerNamespace.makeDefinition({ Model, Message })
```

Application authoring values use `ApplicationDefinition`, and their Compositions use `ApplicationComposition`. The rule follows supported `foldkit` root, `foldkit/block`, and `foldkit/application` imports, including namespace and import aliases. It follows inline chains and authoring values declared in the same file. A Composition derived from an authoring value imported from another local module is not verified because Oxlint does not expose cross-module symbol or type information. Dynamic names are left for the developer to review.

Rules that inspect HTML builder calls share provenance-aware recognition. They recognize `HtmlBuilder`, `Block.ViewBuilderFor<typeof FooComposition>`, local aliases of those types, owner-specific ViewBuilder types imported from a relative module, and the builder parameter of `FooComposition.makeView` and `makeView.withInputs` callbacks. For an imported alias, the plugin resolves the relative TypeScript module and explicit re-export barrels until it finds an actual exported `Block.ViewBuilderFor` declaration; declaration-like text in comments and string literals is ignored. This covers extracted view helpers while leaving unrelated types named `*ViewBuilder` alone. Package aliases, wildcard re-exports, JavaScript declarations, and generated declaration-only modules are not resolved; annotate those helpers directly with `HtmlBuilder` or `Block.ViewBuilderFor` when lint recognition is needed.

The `command-define-pascal-const` rule owns the complete Command declaration convention for both `Command.define` and Definition `command` calls: literal PascalCase identity, `const` binding, and an exact binding-name match. The older `command-binding-matches-name` configuration ID has been removed. Replace it with `foldkit/command-define-pascal-const` in explicit rule configurations. The same consolidated `no-direct-block-state-update` ID covers discarded Commands and OutMessages when a parent copies a child update or operation result's `model`; the older `require-fold-for-child-update-result` ID has also been removed.

`foldkit/no-direct-block-state-update` also recognizes child-owned transform references in `modifyFields`, `Definition.stepFields`, and point-free `Array.map` updates. It uses the Block registered by a local Binding as evidence: a transform must resolve through the same imported namespace or local path, through a named `block` import from the same module, or through a local helper whose parameter and return types both name that child module's Model. The rule deliberately leaves cross-file Composition registration and unannotated local helper inference to type review because Oxlint does not expose the required project-wide type ownership.
