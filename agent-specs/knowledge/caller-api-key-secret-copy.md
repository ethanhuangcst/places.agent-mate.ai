---
title: Caller API key secret persistence and Keys list Copy
type: ops-lesson
status: active
as_of: 2026-08-21
tags:
  - places-agent
  - admin
  - api-keys
  - security
related_spec: agent-specs/agent-design.md
related:
  - adr/ADR-034-caller-api-key-secret-at-rest.md
  - knowledge/e2e-fixture-vendor-mode.md
---

# Caller API key secret persistence and Keys list Copy

## Summary
Caller secrets are stored in Postgres as nullable `CallerApiKey.secret` for admin list Copy. Bearer auth still uses `keyHash`. Pre-migration rows cannot recover plaintext — Regenerate or Issue again.

## Evidence
- Migration `20260821120000_add_caller_api_key_secret`
- Admin list returns `secret`; Keys row action **Copy** writes clipboard (`admin.keys.copy_list`)
- Layout: Keys page uses `content--keys` (~56rem) and `row-actions` `nowrap` so Copy/Edit/Regenerate/Delete stay on one line

## Lesson / guidance
- After deploy: run Prisma migrate; regenerate any production key that still shows disabled Copy
- Do not expect hash-only rows to become copyable without rotation
- When adding another row action, keep Keys content width / nowrap — four labels overflowed the old ~760px content max

## Links
- [ADR-034](../../workspace-specs/adr/ADR-034-caller-api-key-secret-at-rest.md)
- Admin mockup: `agent-specs/ui-mockup/06-keys.html`
