# Application Markdown

`@amends-dev/markdown` parses chat messages and resolves member mentions for the app and the design
renderers. It depends on Effect and Marked, with no browser APIs, styles, or UI framework.

This separate application package keeps the dependency direction explicit: both `app-v2` data
and `design` consume the parser. Neither needs the other's implementation. It lives under
`apps/` because it uses Marked; the portable packages under `packages/` depend only on Effect.

```ts
import { markdownWords } from "@amends-dev/markdown"

markdownWords({
  text: "Hello **there**, [@Ada](member:ada)",
  mentions: [{ id: "ada", name: "Ada Lovelace" }]
})
// "Hello there, @Ada Lovelace"
```

`markdownWords({ text, mentions? })` returns one line without Markdown formatting. Blocks and
line breaks become spaces. Links contribute their labels, images their descriptions, and code
its text. Known named and numeric character references decode outside code. A `member:<id>`
link uses the member's current name when supplied, otherwise its recorded label.

`previewRuns` returns the same content as runs of text, distinguishing mentions so a renderer
can style them. `parseMarkdown` returns Marked tokens with GFM and line breaks enabled. The
renderer helpers share entity decoding, nested tokens, and mention lookup and labels; the
package re-exports Marked token types for consumers. It installs no lexer extensions.

Rendering policy stays in `design/richText`: which URLs become links, how raw HTML appears,
and whether a mention opens a profile card. This package never creates HTML or loads a URL.

`bun run test -- --project @amends-dev/markdown` runs the plain-text tests without a DOM.
The design's scene tests check rendered Markdown and inline previews against the same parser.
`bun run check:packages` prevents this package from importing app features or design code and
keeps app data independent of renderers.
