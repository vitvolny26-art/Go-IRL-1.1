# GO IRL channel inbound worker — VPS runtime runbook

Status: PREPARED / NOT ACTIVATED
Scope: Patch D.1 operator wiring for the durable channel inbound worker.
Canonical production frontend: `https://go-irl.fun`.
Canonical repository: `vitvolny26-art/Go-IRL-1.1` on `main`.

## Safety boundary

This runbook does not authorize or perform any production mutation. Separate owner approval is required before:

- creating or changing `/etc/go-irl/channel-inbound-worker.env`;
- installing or changing a systemd unit;
- enabling or starting the worker service;
- inserting a controlled production queue fixture;
- enabling `GO_IRL_CHANNEL_INBOUND_FAST_INGRESS_CHANNELS`;
- changing the existing n8n deploy workflows.

Never print or persist secret values in chat, logs, GitHub, Drive, or the unit file.

## Preconditions

Before any root or production change, verify all of the following read-only:

1. GitHub `main` SHA is the exact intended release SHA and required CI is GREEN.
2. VPS checkout `/srv/goirl-1.1` is clean and matches that exact SHA.
3. `goirl-runner` exists and is the intended non-root runtime user.
4. `node`, `pnpm`, and `systemctl` are available for the runtime user.
5. Patch B queue migration/RPCs are present in production Supabase.
6. `GO_IRL_CHANNEL_INBOUND_FAST_INGRESS_CHANNELS` remains unset/empty during worker-only canary.
7. No existing `go-irl-channel-inbound-worker.service` or equivalent supervisor is already active.

If any item is unknown, stop and inspect instead of guessing.

## Build exact worker artifact

From `/srv/goirl-1.1` at the verified exact SHA:

```sh
pnpm install --frozen-lockfile
pnpm run build:channel-inbound-worker
test -f .worker-dist/scripts/channel-inbound-worker.js
```

The current frontend-only auto-deploy does not build `.worker-dist`; worker delivery therefore requires an explicit worker build step until the deployment workflow is separately patched and approved.

## Runtime configuration contract

The service expects `/etc/go-irl/channel-inbound-worker.env`. The file must contain only runtime configuration and existing approved secrets; values are intentionally omitted here.

Required names:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GO_IRL_PUBLIC_ORIGIN=https://go-irl.fun`
- `GO_IRL_CHANNEL_INBOUND_WORKER_ENABLED=true`

Optional bounded tuning:

- `GO_IRL_CHANNEL_INBOUND_WORKER_BATCH_LIMIT` — default `50`, range `1..200`
- `GO_IRL_CHANNEL_INBOUND_WORKER_LEASE_SECONDS` — default `300`, range `30..1800`
- `GO_IRL_CHANNEL_INBOUND_WORKER_MAX_ATTEMPTS` — default `5`, range `1..20`
- `GO_IRL_CHANNEL_INBOUND_WORKER_POLL_MS` — default `1000`, range `250..60000`

Recommended ownership/permissions must be decided from the actual VPS user/group model during the approved config step. Do not assume a root-only mode that prevents the service user from reading the file.

## Canary sequence — worker only

Keep fast ingress OFF.

1. Build the worker artifact at the exact release SHA.
2. Load the approved runtime environment without printing values.
3. Run one batch only:

```sh
node .worker-dist/scripts/channel-inbound-worker.js --once
```

4. Require exit code `0`.
5. Require a structural `channel_inbound_worker_health` record with `ok: true`.
6. Record `claimed`, `processed`, `duplicates`, `retried`, `deadLetter`, `oldestClaimedAgeSeconds`, and `durationMs`.
7. Do not treat an empty-queue run (`claimed=0`) as proof of end-to-end business processing. It proves startup/config/RPC reachability only.

A controlled queue fixture is a separate production-data boundary. If explicitly approved later, use a deterministic non-user fixture and verify claim -> process -> finish plus idempotent replay before enabling provider traffic.

## systemd unit preparation

Template: `ops/systemd/go-irl-channel-inbound-worker.service.template`.

Before installation, verify on the VPS that `/bin/bash`, the runtime user's login PATH, `node`, the working directory, and the environment-file path are correct. The template intentionally uses the existing non-root `goirl-runner` account and does not include secrets.

Installation, `daemon-reload`, `enable`, `start`, or `restart` are production configuration changes and require explicit approval.

## Activation gate

Do not enable provider fast ingress until all are GREEN:

1. exact worker source is merged and exact-head CI is GREEN;
2. exact worker artifact is built on the VPS;
3. worker one-shot canary exits `0`;
4. controlled processing/retry/dead-letter smoke is GREEN if production-data canary is authorized;
5. persistent supervisor is active and emits healthy structural logs;
6. Patch C exact artifact is deployed to the Vercel ingress runtime;
7. rollback is proven: clearing the per-channel fast-ingress gate restores the old synchronous path;
8. channel activation is explicit and canary-first, one channel at a time.

## Deployment workflow follow-up

The current GitHub-triggered VPS auto-deploy builds only the Vite frontend. A separate bounded release task should update deployment automation so an approved worker release:

- builds `build:channel-inbound-worker` for the exact SHA;
- verifies the artifact exists before service restart;
- restarts only the worker service after successful build;
- verifies systemd active state and recent health log;
- never enables fast ingress automatically;
- respects the separate deploy-approval boundary rather than auto-promoting every merge.

Until that task is approved and completed, worker build/restart remains an explicit operator step.

## Rollback

Worker rollback is independent from frontend rollback:

1. keep fast ingress OFF or clear its channel list;
2. stop/disable the worker service if worker behavior is suspect;
3. restore the previously verified application SHA only through the governed release path;
4. never delete durable queue rows to make rollback look clean;
5. preserve failed/dead-letter evidence for diagnosis.
