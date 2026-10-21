import { Array, Option } from 'effect'
import { type Block, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { DialogBlock } from '@foldkit/ui'

import { saveCanvas } from './command'
import {
  GRID_SIZE_RADIO_GROUP_ID,
  GridSizeRadioGroupBlock,
  PALETTE_RADIO_GROUP_ID,
  PaletteRadioGroupBlock,
  TOOL_RADIO_GROUP_ID,
  ThemeListboxBlock,
  ToolRadioGroupBlock,
} from './components'
import { DEFAULT_COLOR_INDEX } from './constant'
import { ApplicationDefinition } from './definition'
import { createEmptyGrid, isGridEmpty } from './grid'
import { Message } from './message'
import {
  Model,
  type PaletteIndex,
  type Tool,
  paletteIndexFromValue,
} from './model'
import { PALETTE_THEMES } from './palette'

const foldErrorDialogOutMessage = DialogBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  Opened: () => ApplicationDefinition.stepNoop(),
  Closed: () => model => ({
    model: modifyFields(model, { maybeExportError: () => Option.none() }),
  }),
  CompletedClose: () => ApplicationDefinition.stepNoop(),
})

export const ErrorDialogBinding = ApplicationDefinition.bindChild(DialogBlock, {
  field: 'errorDialog',
  init: { contextToArgs: () => [{ id: 'export-error-dialog' }] },
  outMessage: { fold: foldErrorDialogOutMessage },
})

const foldGridSizeConfirmDialogOutMessage = DialogBlock.OutMessage.match<
  Update.Step<Model, Message>
>({
  Opened: () => ApplicationDefinition.stepNoop(),
  Closed: () => model => ({
    model: modifyFields(model, { maybePendingGridSize: () => Option.none() }),
  }),
  CompletedClose: () => ApplicationDefinition.stepNoop(),
})

export const GridSizeConfirmDialogBinding = ApplicationDefinition.bindChild(
  DialogBlock,
  {
    field: 'gridSizeConfirmDialog',
    init: { contextToArgs: () => [{ id: 'grid-size-confirm-dialog' }] },
    outMessage: { fold: foldGridSizeConfirmDialogOutMessage },
  },
)

export const selectTool = (model: Model, tool: Tool) => ({
  model: modifyFields(model, { tool: () => tool }),
})

export const selectColor = (model: Model, colorIndex: PaletteIndex) => {
  const nextModel = modifyFields(model, {
    selectedColorIndex: () => colorIndex,
  })
  return { model: nextModel, commands: [saveCanvas(nextModel)] }
}

const foldToolRadioGroupOutMessage = ToolRadioGroupBlock.OutMessage.match({
  Selected: ({ value }) =>
    ApplicationDefinition.step(model => selectTool(model, value)),
})

export const ToolRadioGroupBinding = ApplicationDefinition.bindChild(
  ToolRadioGroupBlock,
  {
    field: 'toolRadioGroup',
    init: { contextToArgs: () => [{ id: TOOL_RADIO_GROUP_ID }] },
    outMessage: { fold: foldToolRadioGroupOutMessage },
  },
)

export const applyGridSizeChange = (model: Model, size: number) => ({
  model: modifyFields(model, {
    grid: () => createEmptyGrid(size),
    gridSize: () => size,
    undoStack: () => [],
    redoStack: () => [],
    isDrawing: () => false,
    maybeHoveredCell: () => Option.none(),
  }),
})

export const requestGridSizeChange = (size: number) =>
  ApplicationDefinition.step(model => {
    if (size === model.gridSize) {
      return { model }
    }

    if (isGridEmpty(model.grid)) {
      return applyGridSizeChange(model, size)
    }

    const rememberGridSize = ApplicationDefinition.stepFields(() => ({
      maybePendingGridSize: () => Option.some(size),
    }))

    return Update.combine([
      rememberGridSize,
      GridSizeConfirmDialogBinding.requestOpen(),
    ])
  })

const foldGridSizeRadioGroupOutMessage =
  GridSizeRadioGroupBlock.OutMessage.match({
    Selected: ({ value }) => requestGridSizeChange(Number(value)),
  })

export const GridSizeRadioGroupBinding = ApplicationDefinition.bindChild(
  GridSizeRadioGroupBlock,
  {
    field: 'gridSizeRadioGroup',
    init: { contextToArgs: () => [{ id: GRID_SIZE_RADIO_GROUP_ID }] },
    outMessage: { fold: foldGridSizeRadioGroupOutMessage },
  },
)

const foldPaletteRadioGroupOutMessage = PaletteRadioGroupBlock.OutMessage.match(
  {
    Selected: ({ value }) =>
      ApplicationDefinition.step(model =>
        selectColor(
          model,
          paletteIndexFromValue(value, model.selectedColorIndex),
        ),
      ),
  },
)

export const PaletteRadioGroupBinding = ApplicationDefinition.bindChild(
  PaletteRadioGroupBlock,
  {
    field: 'paletteRadioGroup',
    init: { contextToArgs: () => [{ id: PALETTE_RADIO_GROUP_ID }] },
    outMessage: { fold: foldPaletteRadioGroupOutMessage },
  },
)

const foldThemeListboxOutMessage = ThemeListboxBlock.OutMessage.match({
  Selected: ({ value }) =>
    ApplicationDefinition.step(model => {
      const themeIndex = Number(value)
      const maybeNextTheme = Array.get(PALETTE_THEMES, themeIndex)
      if (Option.isNone(maybeNextTheme)) {
        return { model }
      }
      const nextModel = modifyFields(model, {
        paletteThemeIndex: () => themeIndex,
        selectedColorIndex: () => DEFAULT_COLOR_INDEX,
      })
      return { model: nextModel, commands: [saveCanvas(nextModel)] }
    }),
})

export const ThemeListboxBinding = ApplicationDefinition.bindChild(
  ThemeListboxBlock,
  {
    field: 'themeListbox',
    init: { contextToArgs: () => [{ id: 'theme-picker' }] },
    outMessage: { fold: foldThemeListboxOutMessage },
  },
)

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [
    ErrorDialogBinding,
    ThemeListboxBinding,
    GridSizeConfirmDialogBinding,
    ToolRadioGroupBinding,
    GridSizeRadioGroupBinding,
    PaletteRadioGroupBinding,
  ],
})
export type ApplicationViewBuilder = Block.ViewBuilderFor<
  typeof ApplicationComposition
>
