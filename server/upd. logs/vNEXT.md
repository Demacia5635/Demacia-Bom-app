# Server: next version

**Unreleased.** On branch `fix/serv`, not on `MASTER` yet.

## Changes

- **Work-order progress counts bought lines too.** `GET /db/workOrder/summary` and `GET /api/admin/production` add `progress: { finished, total, percent }` over all lines (made and bought, not "Untracked"), counted exactly like the work-order page. Production's "open" orders follow it. The older made-only fields are unchanged. (`51338c6`)
