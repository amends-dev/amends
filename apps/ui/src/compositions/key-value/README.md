# Key and value

Compose a semantic description list through named parts:

```tsx
<KeyValue.Root aria-label="Run metadata">
  <KeyValue.Row>
    <KeyValue.Label>model</KeyValue.Label>
    <KeyValue.Value>claude-sonnet-4-6</KeyValue.Value>
  </KeyValue.Row>
</KeyValue.Root>
```

Root renders `dl`; each Row groups its `dt` Label and `dd` Value. Use one label/value
pair per row, and conditionally render whole rows when data is absent. Values accept
ordinary children, including text, status indicators, links, or buttons. The caller
owns formatting, empty-value wording, and actions. Native props and refs are forwarded.

The Primitives v2 reference defines the default: keys at the start, values at the
opposite edge, compact monospace type (11.5px / 12.5px), 10px vertical padding, and
4px / 16px gaps. Dashed seams separate rows, with no seam after the final row.
Dimensions scale with root text size; colors inherit the reviewed theme tokens.

Neither column has a fixed width. When a pair does not fit, the value flows beneath
the key at the start edge. Long identifiers wrap without truncation or horizontal
scrolling. RTL follows the inherited direction. The component supplies no card,
heading, page width, or outer padding; compose those around it when needed.

Storybook covers the exact reference content, both themes, narrow and long content,
RTL, enlarged text, and reactive composed values. Existing Settings consumers keep
the same parts and receive the corrected presentation.
