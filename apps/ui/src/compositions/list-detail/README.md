# List and detail

Compose `Root selected={boolean}` with `List` and an optional `Detail`. The Settings
mock uses a flexible list, 34px gap, and 310px person aside on desktop and laptop.
At tablet and phone widths, selection shows one full-width pane at a time. The
caller supplies a `Back` link and owns the selection and URL. No modal behavior is
implied by this detail pattern; the Shell v2 session log is a separate 400px panel.
