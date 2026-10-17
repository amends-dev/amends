---
"@amends-dev/toolkit": patch
---

`Presentation.merge` and `Presentation.restrict` keep the types of the tools they are given, as Effect's `Toolkit.merge` does, so a toolkit from `CodeMode.toolkit` or `merge` asks for the services its tools need rather than `any`, and a program that runs a turn with one has no requirements left to `BunRuntime.runMain`.
