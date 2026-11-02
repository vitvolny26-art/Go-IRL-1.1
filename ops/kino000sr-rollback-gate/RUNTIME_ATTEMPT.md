# Local runtime verification — 2026-11-02

## Scope correction after owner-parity audit

The recorded PASS below was produced before the harness was corrected and created the baseline function as `service_role`. It is retained as historical evidence, but it does not establish PROD owner parity with the previously observed `postgres` owner. The corrected harness now applies the baseline and candidate as `postgres`, grants `service_role` execution explicitly, and requires owner `postgres`. A fresh isolated rerun was required; the independent exact-head GitHub Actions result is recorded below.

Status: passed in an isolated local PostgreSQL 18 container.

## Observed environment

- Docker Desktop: 4.75.0.227598.
- Docker Desktop WSL backend was initially stopped.
- No native `psql` or PostgreSQL installation was available.

## Recovery attempted

Two stale runtime directories were preserved as recoverable backups:

- `C:\Users\lenovo\AppData\Local\Docker\run.kino000sr-backup-20261101`
- `C:\Users\lenovo\AppData\Local\docker-secrets-engine.kino000sr-backup-20261101`

No backup was deleted.

After Docker Desktop recreated clean runtime directories, its backend still reproduced the same failure on a newly created `dockerInference` socket:

`starting services: initializing Inference manager: ... dockerInference: The file cannot be accessed by the system ...`

## Result

- PostgreSQL 18 container: not created.
- Candidate SQL compilation: not executed.
- Rollback SQL restoration: not executed.
- MD5, owner, ACL, search_path, security-invoker and idempotence runtime assertions: not executed.
- GitHub Actions workflow: not run.
- PROD/TEST databases, GitHub and n8n: not accessed or mutated.

At the end of the 2026-11-01 attempt, static source hashes and workflow checks were the only validated results. The successful rerun below supersedes that blocked runtime status.

## Resolution and successful rerun

Docker Desktop was updated from 4.75.0.227598 to 4.97.0.244584 using the official Windows installer. Its verified installer SHA-256 was:

`2668273f82b342a058a28f9ab53ea7bddde10bb6d51307ce2ec54c2d36459744`

The updated backend started successfully. The local gate then ran in a disposable, unexposed `postgres:18-bookworm` container using image digest:

`sha256:5c4783a8cc3f0074912164f94dfa1be4e043438f0f707cf968d7af9a0d31a2c8`

Observed gate output:

- `PostgreSQL 18 rollback gate passed`
- candidate definition MD5: `cc8580fa95e32bce97ce9d37c62fd194`
- restored definition MD5: `808bae5d2fb87dc1794e6846507990fa`
- restored owner: `service_role`
- restored ACL: `service_role=X/service_role`
- restored `SECURITY INVOKER`: `prosecdef=false`
- restored function setting: `search_path=pg_catalog, public`
- repeated rollback metadata snapshot remained identical

The disposable container was stopped and removed after the test. No port was published. The GitHub Actions workflow was not run, and no PROD/TEST database, GitHub, n8n, deployment, commit, push or PR mutation occurred.

## Corrected isolated GitHub Actions result — 2026-11-02

- PR: [#1608](https://github.com/vitvolny26-art/Go-IRL-1.1/pull/1608).
- Exact head: `d8793c2b2d2e52d7d686286460392e85372e0349`.
- Workflow run: [41409241461](https://github.com/vitvolny26-art/Go-IRL-1.1/actions/runs/41409241461) — `completed/success`.
- PostgreSQL server: 18.6; service container used pinned image digest noted above.
- Source checksum gate: passed before SQL execution.
- Candidate definition MD5: `cc8580fa95e32bce97ce9d37c62fd194`.
- Restored definition MD5: `808bae5d2fb87dc1794e6846507990fa`.
- Restored metadata: `808bae5d2fb87dc1794e6846507990fa|postgres|postgres=X/postgres,service_role=X/postgres|false|search_path=pg_catalog, public`.
- SQL assertions and repeated rollback metadata idempotence: passed.
- The job used an isolated PostgreSQL service container; it does not establish a PROD migration or production-runtime result.

This CI result supersedes the earlier `service_role` owner-parity failure for the corrected test harness. Historical local attempts above remain unchanged.
