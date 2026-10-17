---
"@amends-dev/harness-opencode": patch
---

`OpencodeAgent` streams a `file-change` part for each file of a patch from opencode's `apply_patch`, the tool opencode gives OpenAI's models in place of `write` and `edit`; a moved file is the file it removed and the one it created.
