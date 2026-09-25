# Theme provider

`ThemeProvider` establishes a CSS inheritance scope using the existing Cotton/Soot
classes and reviewed body typography. Components, including Shell, inherit it.
The caller chooses the theme and owns preferences, persistence, and system-mode
detection. Fonts remain an explicit application entry-point import.

```tsx
<ThemeProvider theme="cotton">
  <Shell.Root>{content}</Shell.Root>
</ThemeProvider>
```

Nested providers can select a different theme. Updating `theme` preserves children,
drafts, and focus. Native attributes apply to the provider's div. It introduces no
palette, layout, or application state. **Foundations / Theme** covers nested scopes
and reactive updates; browser checks verify color-scheme and font inheritance.
