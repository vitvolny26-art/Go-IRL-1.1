# GO IRL channel inbound worker — one-time root bootstrap

Status: PREPARED / NOT APPLIED

Purpose: establish the minimum privileged boundary needed for the durable channel inbound worker without granting `goirl-runner` a general root shell or unrestricted `sudo`.

## Security model

- `goirl-runner` remains the normal SSH/runtime identity.
- One operator root session installs a root-owned helper and one narrowly scoped sudoers rule.
- The helper accepts only a fixed action allowlist and validates the exact 40-character GitHub release SHA before install/start/restart.
- The helper never writes, accepts, prints, or returns secret values.
- `SUPABASE_SERVICE_ROLE_KEY` must be entered directly in the root operator session or sourced from an approved secret manager. Never paste it into chat, GitHub, Drive, n8n, or logs.
- Fast ingress remains OFF during worker bootstrap and canary.

## One-time root actions

1. Verify GitHub `main`, CI, and VPS checkout are on the exact authorized release SHA.
2. Copy `ops/workerctl/go-irl-channel-workerctl` to `/usr/local/sbin/go-irl-channel-workerctl` as `root:root`, mode `0755`.
3. Copy `ops/sudoers/go-irl-channel-workerctl` to `/etc/sudoers.d/go-irl-channel-workerctl` as `root:root`, mode `0440`.
4. Validate the sudoers file with `visudo -cf /etc/sudoers.d/go-irl-channel-workerctl` before ending the root session.
5. Create `/etc/go-irl/channel-inbound-worker.env` as `root`, never from chat copy/paste. Recommended mode is `0640`; group/readability must be verified against the actual `goirl-runner` primary group before service start.
6. The environment file must contain only the required worker runtime configuration and existing approved secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GO_IRL_PUBLIC_ORIGIN=https://go-irl.fun`
   - `GO_IRL_CHANNEL_INBOUND_WORKER_ENABLED=true`
   - optional bounded worker tuning variables documented in the Patch D.1 runbook.

## Post-bootstrap non-root sequence

From the existing `goirl-runner` SSH automation path:

1. Build the exact worker artifact with `pnpm run build:channel-inbound-worker`.
2. Confirm the canonical VPS checkout is clean and on the exact authorized SHA.
3. Run `sudo /usr/local/sbin/go-irl-channel-workerctl canary <exact-40-char-sha>` while fast ingress is OFF. The root helper reads the protected env file, drops execution to `goirl-runner`, and runs exactly one worker batch. Require exit code `0` and structural `channel_inbound_worker_health` with `ok: true`.
4. Empty queue (`claimed=0`) proves startup/config/RPC reachability only; it is not an end-to-end processing proof.
5. Use the restricted helper to install the unit and start the service only after the one-shot canary is GREEN.
6. Verify `systemctl is-active`, bounded recent logs, queue lag, and no repeated restarts.

## Rollback

- Clear/keep the fast-ingress channel gate OFF.
- Use `sudo /usr/local/sbin/go-irl-channel-workerctl stop` or `disable`.
- Preserve queue/dead-letter evidence; never delete rows to make rollback appear clean.
- Remove or rotate the environment file only through an approved root/secret-management operation.
