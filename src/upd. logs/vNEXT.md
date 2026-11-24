# Website: next version

**Unreleased.** On branch `fix/web`, not on `MASTER` yet.

## Fixes

- **Un-finishing a work-order part didn't update the progress.** Finishing a part also set its Priority to "Finished", but changing the status back left it there, so the part still counted as finished (in the header's "25/26", the chips, "Hide finished" and the work-order list), even after a reload. The link now works both ways: a status that's no longer finished sets Priority to Medium, and a Priority changed away from "Finished" sets the status to "In manufacturing" (or "To buy" for bought items). Lines already saved that way are repaired by the server's one-off repair (server next version). (`35418e9`)
- **Revision:** a made part without a revision number yet shows "1" (the server's rule) instead of a blank; vendor parts show "—" like other standard parts. (`93e4714`)
