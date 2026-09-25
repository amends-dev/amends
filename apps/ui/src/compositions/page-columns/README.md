# Page columns

`PageColumns.Root` places `Primary` beside a persistent 310px `Aside`, with the
same 34px gap as the selected-person layout. Use it for two sections that remain
available together, such as invitation history and a new-invite form.

```tsx
<PageColumns.Root>
  <PageColumns.Primary>History</PageColumns.Primary>
  <PageColumns.Aside aria-label="New invitation">Form</PageColumns.Aside>
</PageColumns.Root>
```

At tablet and phone widths the sections stack in source order; neither is hidden.
Selection-driven list/detail pages use `ListDetail` instead. The composition owns
only geometry. Apps and features supply content, labels, and behavior.
