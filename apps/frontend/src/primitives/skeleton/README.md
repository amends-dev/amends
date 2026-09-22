# Skeleton

`Skeleton` is a static, decorative bar for the first paint of a loading region. It follows
the three 12px-high, 4px-radius bars in the [Primitives v2 reference](<../../../../../design-system/Amends Primitives v2.dc.html>).
The default bar fills its container; use native `style` for a shorter width or a different
height. Place multiple bars with layout primitives or CSS. The caller replaces them with
content when it arrives; Skeleton has no timer or animation.

```tsx
<section aria-label="Loading thread preview" aria-busy="true">
  <Skeleton style={{ width: "62%" }} />
  <Skeleton style={{ width: "88%" }} />
</section>
```

Skeleton itself is always `aria-hidden`. The containing region owns the accessible loading
state and name. `surface.skeleton` is a decorative color role on canvas and panel in both
themes; it is not a text background or a progress indication. Use `aria-busy` while loading
and clear it when real content replaces the bars. The Storybook Reference matches the mock;
Comparison covers both themes and surfaces, and Narrow checks constrained width.
