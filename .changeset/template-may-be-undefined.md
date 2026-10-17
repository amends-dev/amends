---
"@amends-dev/sandbox": patch
---

`CreateOptions.template` may be given as `undefined`, as an agent's `template` is when the agent needs no sandbox, so `create({ template: harness.agent.template })` typechecks under `exactOptionalPropertyTypes`.
