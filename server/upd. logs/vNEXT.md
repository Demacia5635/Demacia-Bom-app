# Server: next version

**Unreleased.** On branch `fix/serv`, not on `MASTER` yet.

## New

- **`GET /api/admin/check`** answers 204 when the `x-admin-secret` header is right (404 otherwise), so the website can unlock its admin icons in a browser. (`1f32b58`)

## Changes

- **Guessing the admin secret is slowed down** on every admin route: each wrong try answers after 1 second, and after 10 wrong tries from one network (or 100 in all) within 15 minutes, admin routes answer "Too many requests" for 15 minutes, even with the right secret. A right secret resets the count; a server restart clears it. Note: everyone on one network (e.g. school Wi-Fi) shares the count. (`1f32b58`)
