WEB001-D5 Acceptance Contract — Header/Auth Alignment (Russian)


Task Definition
Stabilize Telegram / Google / Facebook controls and page headings on one desktop grid without overlap or visual drift. Preserve mobile and Telegram behavior.

Authority Baseline
- GitHub main: bf36be345f14401b8d93dd25e443825a5c8b8cd8
- Canonical production: https://go-irl.fun on VPS/Caddy
- Report evidence drives: DRIVE: 1kIgoEwpqzvSURlaIeNwkohfUXQbuw0uz0nVahVjGmT8 (CLICKUP: 869ekujr3)

Current Status (from RMAP019)
- Status: Blocked / current-main applicability RED
- Blocker: The prepared two-file LaunchPage patch references stale CSS baseline (old blob f0f2da1) — fresh GH:main@bf36be3 has responsive-shell.css blob 013df58bc7a25b90f371a43acf0c4becd182ddc7
- git apply --check fails on src/responsive-shell.css (target block around lines 170-178)
- Mandatory pnpm repo gates: NOT RUN because current execution transport cannot resolve github.com

Acceptance Criteria (from RMAP019 & GO IRL 2.0)
1. One task at a time — do not combine D3-D7 into one patch
2. Fresh main inspection before any edits — every code patch requires fresh GitHub main
3. Preserve mobile and Telegram behavior
4. pnpm only — mandatory local gates: repo:check, lint, typecheck, build, test, git diff --check
5. Ready-for-review PR only after implementation complete + local GREEN; never Draft PR
6. Require GitHub Actions GREEN on exact intended PR head SHA
7. Merge requires explicit owner approval — never infer from task continuation
8. Production deploy requires separate explicit owner approval — VPS/Caddy, not Vercel
9. Do not change Auth policy/provider configuration, secrets, RLS, SQL, migrations, production data or production configuration
10. Do not use old supabase WEB001 migrations as specification

Execution Sequence (from RMAP018/019)
Audit → Design → Implement → Local Verify → Ready PR → Exact-head CI → Merge Gate → Deploy Gate → Runtime Verify → Reconcile

D5 Execution State
- Blocked — prepared patch generated from synthetic/stale CSS baseline
- Regenerate from actual fresh-main bytes first before any application
- Do not promote existing prepared patch

Next Action (from RMAP018 Codex Handoff)
"audit fresh main and production evidence for WEB001-D3, define the smallest desktop-only Activities reflow patch, verify locally, then stop at the next required approval gate."

Out of Scope
- AUTH200/AUTH201 implementation
- Architecture rewrites
- Rebuilding Share, Profile, Beauty, Booking subsystem foundations
- Supabase Auth/provider configuration without separate approval
- RLS, destructive SQL, migrations, production data, secrets, DNS, domains, or production configuration without explicit approval
- Vercel promotion unless explicitly authorized

Generated from: RMAP019, RMAP018, GO IRL 2.0 roadmaps (2026-08-18/19)
Source: Google Drive documents provided by user