---
title: Agent Report — GROOMING022 VPS Runner Publish Boundary
owner: VPS Operator
status: Draft
source_of_truth: false
last_review: 2026-09-03
next_review: 2026-09-04
---

# Agent Report — GROOMING022 VPS Runner Publish Boundary

## Task

Repair the privileged publish boundary used by the canonical `GO IRL VPS Deploy` workflow without granting `goirl-runner` a general root shell or passwordless access to arbitrary filesystem commands.

This is a release-path correction inside GROOMING022. The GROOMING022 Beauty city-policy source is already merged; its production Supabase migration remains a separate protected gate.

## Files inspected

- `.github/workflows/vps-deploy.yml`
- `ops/workerctl/go-irl-channel-workerctl`
- `ops/sudoers/go-irl-channel-workerctl`
- `docs/runbooks/channel-inbound-worker-root-bootstrap.md`
- `docs/operations/SELF_HOSTED_RUNNER.md`
- `AGENTS.md`
- `docs/reports/README.md`

Fresh source parent for this candidate: `main@8b9fde5db15970abca9e5f8c4ca5cdda143973cb`.

## Findings

The current VPS deploy workflow builds the exact requested merged `main` SHA successfully, then enters the publish phase with raw privileged `sudo rm`, `sudo mkdir`, `sudo cp` and `sudo mv`. The self-hosted runner does not have that broad passwordless sudo capability, so the workflow is blocked before stage publication and HTTP health verification.

The repository already establishes the safer privileged model elsewhere: `goirl-runner` receives `NOPASSWD` only for one root-owned bounded helper, while the helper itself validates allowed actions and exact release identity. Expanding sudoers to arbitrary filesystem commands would violate that model.

## Changes made

- Add `ops/workerctl/go-irl-stage-publish`, a fixed-path root helper with only `preflight`, `publish <sha> <run-id>` and `rollback <sha> <run-id>` actions.
- Validate exact 40-character lowercase SHA, numeric GitHub run id, the tracked-clean exact-SHA Actions workspace, root-owned `/opt`, non-symlink stage paths, and regular static build output with no symlinks/devices/FIFOs/sockets.
- Publish to `/opt/go-irl-stage` through a bounded sibling staging directory, keep one previous stage for rollback, and write a root-owned marker tying rollback to the exact SHA/run id that performed the publish.
- Add `ops/sudoers/go-irl-stage-publish`, granting `goirl-runner` passwordless sudo only for `/usr/local/sbin/go-irl-stage-publish`.
- Update `.github/workflows/vps-deploy.yml` to call only the bounded helper for privileged publish operations and to invoke helper rollback when production HTTP/service-worker health fails.
- Do not grant `NOPASSWD` for `rm`, `mkdir`, `cp`, `mv`, shell, package management, service management, or arbitrary commands.

## Checks

Candidate-only checks performed before the commit gate:

- `sh -n ops/workerctl/go-irl-stage-publish` — PASS.
- YAML parse for `.github/workflows/vps-deploy.yml` — PASS.
- Security source assertions: no raw privileged `sudo rm|mkdir|cp|mv`, helper action allowlist fixed, sudoers target limited to the helper — PASS.
- Isolated helper publish -> rollback simulation on temporary fixed test paths — PASS.
- Isolated malformed SHA, path-like run id and symlinked `dist` inputs — fail closed as expected.

Repository quality gates are not claimed at this commit-only checkpoint:

- `pnpm run test` — NOT RUN for this detached commit; exact-head GitHub Actions requires the later push / PR / CI gate.
- `pnpm run typecheck` — NOT RUN for this detached commit; exact-head GitHub Actions requires the later push / PR / CI gate.
- `pnpm run lint` — NOT RUN for this detached commit; exact-head GitHub Actions requires the later push / PR / CI gate.
- `pnpm run build` — NOT RUN for this detached commit; exact-head GitHub Actions requires the later push / PR / CI gate.

## Risks

- The helper and sudoers file are repository source only until a separately authorized production infrastructure/configuration gate installs them as root-owned files and validates sudoers with `visudo`.
- The workflow cannot publish until the reviewed helper is installed at `/usr/local/sbin/go-irl-stage-publish` and the reviewed sudoers rule is installed at `/etc/sudoers.d/go-irl-stage-publish`.
- Production runtime is not proven by static or isolated checks. A later VPS deploy must verify exit code `0`, branch `main`, the exact authorized SHA, successful build and HTTP health.
- Rollback protects the immediately previous `/opt/go-irl-stage` artifact only; it does not alter database state or Supabase migrations.

## Not touched

- No Beauty product/business logic.
- No Activities source or semantics.
- No Supabase SQL/schema/RLS/RPC/migration apply.
- No `.env`, secrets or provider configuration.
- No production data.
- No VPS helper/sudoers installation in this commit-only gate.
- No branch push, PR, CI, merge, VPS deploy or Vercel deploy in this commit-only gate.

## Next step

After the detached commit is verified, obtain a separate explicit push / PR / CI approval. Exact-head GitHub Actions must be GREEN before any merge decision. Production installation of the helper/sudoers rule, VPS deploy retry, and the GROOMING022 production Supabase migration each remain later independent protected gates.
