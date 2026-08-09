# Agent Report — UProfile010 Account Request UI

Date: 2026-08-09
Role: Chief Archivist / Technical Lead
Repository: vitvolny26-art/Go-IRL-1.1
Base: main@2007ed311c141d374c228f9638d959e8fd43d25a
Commit: recorded in Draft PR exact head after connector publication
Merge target: GitHub main
Deploy target: none

## Scope

Prepared one bounded UI slice for UProfile010:

- expose explicit data-export and account-deletion request actions in `/profile/privacy`;
- route both actions through the existing `submitAccountRequest` contract;
- preserve truthful `submitted`, `unavailable`, and `failed` states;
- surface request/correlation references for support diagnostics;
- block duplicate concurrent account requests;
- add focused server-rendered component tests and bounded responsive styles.

## Safety

No backend endpoint, auth architecture, SQL, migration, RLS, secrets, production data, DNS, domain, production configuration, merge, or deployment change is included.

Until a backend transport is separately implemented and injected, the UI returns the existing truthful `transport_unavailable` result and never claims that export/deletion was submitted.

## Verification

- current `main` and PR #704 account-request contract inspected through GitHub connector;
- current `/profile/privacy` usage inspected before patch preparation;
- local repository clone/checks blocked because the isolated container cannot resolve `github.com`;
- prepared patch dry-run/apply and TS/TSX parse checks were completed before release publication;
- exact-head GitHub Actions is required after Draft PR creation.

## Next bounded task

After this UI slice is verified and explicitly authorized for merge, implement the real authenticated backend transport/endpoints as a separate protected review boundary. Do not combine that backend work with this UI-only slice.
