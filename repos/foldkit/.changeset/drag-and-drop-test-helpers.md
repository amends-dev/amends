---
'@foldkit/ui': minor
---

Add `DragAndDrop.test.settleFocus` and `DragAndDrop.test.resolveKeyboardMove` to resolve focus and movement Commands in keyboard drag Story tests. DragAndDrop now embeds through `DragAndDropBlock` and its Binding, so these helpers replay the pending Command's recorded generated delivery without an authored `GotDragAndDropMessage` wrapper.
