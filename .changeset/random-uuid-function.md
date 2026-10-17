---
"@amends-dev/harness": patch
"@amends-dev/harness-claude": patch
"@amends-dev/harness-opencode": patch
"@amends-dev/sandbox-daytona": patch
"@amends-dev/sandbox-e2b": patch
"@amends-dev/sandbox-local": patch
"@amends-dev/sandbox-vercel": patch
---

Works on Effect 4.0.3 and later, which made `Crypto.randomUUIDv4` a function: 0.1.0 failed there with `randomUUIDv4.pipe is not a function`.
