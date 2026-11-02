# Kino000(SR) — PostgreSQL 18 isolated rollback gate

Local-only project for a manually dispatched GitHub-hosted PostgreSQL 18 service-container test. It has no schedule, push or pull-request trigger, no secrets, and no PROD/TEST connection settings.

## Immutable inputs

- Candidate: `vitvolny26-art/Go-IRL-1.1` commit `b030454994e7aedb5d42db6fba8f8c3e59768aae`, path `supabase/migrations/20261031120000_kino000sr_writer_from_test.sql`.
- Rollback: Cinema Drive file `1mHe5cHYZtBkFHYaERnDjdLPfJfkxc7pl`, `Kino000SR_PROD_function.sql`.
- Rollback file SHA-256: `6f76f6b31e7fbc12e1506d1e99632bdf83a6db23944278091ed17a8e36b7d4f1`.
- Rollback file MD5 and expected restored `md5(pg_get_functiondef(...))`: `808bae5d2fb87dc1794e6846507990fa`.
- Candidate file SHA-256: `240ea8ef92c8749c75c0feeaedc030034d94b96dbe2f55b074f248e8efb16413`.

## Gate coverage

The harness creates only a disposable schema in the job service container, applies the exact rollback baseline as `postgres`, grants only the expected `service_role` execution access, compiles the exact candidate, restores the exact rollback, and verifies:

- PostgreSQL server major version 18;
- candidate and rollback compilation;
- candidate → rollback definition restoration;
- restored definition MD5;
- owner `postgres`;
- `service_role` execute access and denial for an untrusted role;
- function-level `search_path=pg_catalog, public`;
- `SECURITY INVOKER` (`prosecdef=false`);
- repeated rollback idempotence for definition and metadata.

## Intentional boundaries

This project does not run itself. The workflow is pull-request gated plus manually dispatchable and remains inert until it is placed in the target repository. It contains no repository token use beyond read-only checkout, no secrets, and no external database host. The bootstrap schema is a minimal compile fixture, not a production-schema substitute.

## Local runtime status

The previous local run passed under a harness that incorrectly created the baseline as `service_role`; that result is superseded for owner-parity purposes. The corrected harness now models `postgres` ownership and must be rerun before release readiness is claimed. See [RUNTIME_ATTEMPT.md](RUNTIME_ATTEMPT.md) for the prior evidence and its scope. The GitHub Actions workflow has not been run.
