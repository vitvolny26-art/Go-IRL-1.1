# GROOMING018 n8n transport hardening report

## Fix

Hardened the inactive GROOMING018 n8n draft after production execution `22853` timed out before reaching the canonical `/api/admin/session` handler. The source contract remains based on Commit: `0335f16`.

## Analysis

- Execution `22853` failed in `Verify GO IRL Admin Session` with `ECONNABORTED` after 10 seconds.
- No matching Vercel invocation existed at the failure time, while later control requests from the workstation and VPS reached the endpoint and returned the expected unauthenticated `401` quickly.
- This evidence classifies the observed failure as a transient n8n-side outbound transport failure before the Vercel invocation layer, not a Google Sheets or application-handler failure.

## Where

- Live n8n workflow: `9HaP8c7n6hcKJUIP`
- Updated inactive draft version: `25e64095-7e5c-4236-bef6-cb081e2858fe`
- Source export: `n8n/workflows/grooming018-beauty-master-requests.json`
- Contract test: `api/_shared/beauty-master-requests.test.ts`

## Run

The draft now uses a 15-second timeout with one bounded retry for session verification and Google Sheets reads. Both error outputs return sanitized webhook responses: `401/403` for access denial, `504` for an upstream timeout, and `502` for other upstream failures. No secrets or upstream error bodies are returned.

## Check

The n8n read-back confirmed `active=false`, `activeVersionId=null`, eight nodes, the exact UUID-prefixed production webhook, `Requests!A:AL`, bounded retry settings, and both error-output connections. No workflow validation warnings were reported.

Local validation results:

- `repo:check`: pass
- GROOMING018 target test: 3/3 pass
- TypeScript typecheck: pass
- ESLint: pass with one pre-existing `no-console` warning in `api/_shared/admin-authorization.ts`
- Production build: pass
- Staff OS contract suite: pass
- Full Vitest suite: 1287/1311 pass; 24 unrelated failures remain, dominated by Windows CRLF-sensitive source-contract assertions and existing 5-second image-render timeouts. The GROOMING018 target test passes inside the same environment.
- `git diff --check`: pass

## If green

After a new Commit is created and exact-head CI passes, a separately approved publish attempt may run the mandatory production smoke. Only a fully green smoke may leave the workflow active.

## If red

Immediately unpublish under the rollback contract and preserve the failing execution evidence. Do not release the selector while canonical `/api/admin/session` reachability remains unverified.

No commit, push, PR update, merge, deploy, workflow publish, SQL/RLS/schema change, `.env` change, secret change, Sheet write, or production-data mutation was performed in this step.
