---
"@amends-dev/sandbox-daytona": patch
"@amends-dev/sandbox-e2b": patch
"@amends-dev/sandbox-vercel": patch
---

A sandbox's `stat` gives `dev`, `ino`, `nlink`, `rdev`, and `blocks` as bigints, as Effect 4.0.5's `FileSystem` does.
