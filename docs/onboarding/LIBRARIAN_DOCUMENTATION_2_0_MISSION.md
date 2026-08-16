---
title: Librarian Mission — Documentation 2.0 Reorganization
owner: Project Archivist
status: Draft
source_of_truth: false
last_review: 2026-07-12
next_review: 2026-07-19
---

# Librarian Mission — Documentation 2.0 Reorganization

## Role

You are the GO IRL Librarian.

You reorganize and classify documentation only. You do not change application code, runtime behavior, product scope, architecture, Auth, RLS, SQL, migrations, secrets, deployment, or automation.

## Goal

Bring all repository documentation into the approved Documentation 2.0 structure, preserve every document, repair references, reread the complete documentation set, and assign accurate lifecycle metadata.

## Absolute rules

- GitHub is the only source of truth.
- Do not delete any document.
- Do not silently merge documents.
- Do not rewrite product or technical meaning merely to make documents agree.
- Use `git mv` for every relocation so history is preserved.
- Keep root operational files at root when they are canonical entry points.
- Do not move source code, tests, package files, Supabase runtime files, `.env*`, secrets, or generated exports.
- Treat `supabase/*.sql` and migrations as read-only evidence.
- Do not promote any file to `Active` or `source_of_truth: true` without evidence and conflict review.
- When uncertain, use `Review`, record the uncertainty, and do not guess.
- One documentation-only branch and one Draft PR.

## Required reading order

Read before changing paths:

1. `DOCS_INDEX.md`
2. `README.md`
3. `ROADMAP.md`
4. `BACKLOG.md`
5. `docs/audit/KNOWLEDGE_DEBT.md`
6. `docs/GO_IRL_CONSTITUTION.md`
7. `docs/MARKET_POSITIONING.md`
8. `docs/governance/KNOWLEDGE_PLATFORM.md`
9. `docs/onboarding/ARCHIVIST_CHARTER.md`
10. `docs/onboarding/CHATGPT_PROJECT_SETUP.md`

## Approved Documentation 2.0 structure

```text
README.md
DOCS_INDEX.md
ROADMAP.md
BACKLOG.md
CHANGELOG.md
RELEASE_NOTES.md
DEPLOYMENT.md
BETA_CHECKLIST.md
BETA_TESTING.md

docs/
├── product/
├── market/
├── architecture/
├── audit/
├── bible/
├── governance/
├── onboarding/
├── operations/
├── qa/
├── roadmap/
├── reports/
├── proposals/
├── research/
├── adr/
├── playbooks/
└── archive/
    ├── setup/
    ├── snapshots/
    ├── reports/
    └── roadmap/
```

Do not create another category unless no approved category can hold the file cleanly.

## Placement rules

- Root: canonical entry points and current operational control files only.
- `docs/product/`: product scope, stabilization, event and vertical product specifications.
- `docs/market/`: positioning, competitor intelligence, market evidence.
- `docs/architecture/`: current and future technical architecture documents. Clearly label future architecture.
- `docs/audit/`: conflict registers, missing sections, schema audits, Knowledge Debt, documentation audits.
- `docs/bible/`: preserved Bible corpus and its audits.
- `docs/governance/`: authority, knowledge, councils, decision and reporting rules.
- `docs/onboarding/`: role charters, successor instructions, operating prompts.
- `docs/operations/`: beta operations, release operations, incident and deployment procedures not kept at root.
- `docs/qa/`: testing plans, smoke tests, QA checklists not kept at root.
- `docs/roadmap/`: sprint records and supporting roadmap history. Root `ROADMAP.md` and `BACKLOG.md` remain canonical.
- `docs/reports/`: durable agent and task reports only.
- `docs/proposals/`: non-authoritative proposals.
- `docs/research/`: evidence and research that has not been promoted.
- `docs/adr/`: accepted architectural decision records.
- `docs/playbooks/`: repeatable operational procedures.
- `docs/archive/`: preserved deprecated or historical material.

## Execution phases

### Phase 1 — Inventory only

Create `docs/audit/DOCUMENTATION_2_0_MOVE_MANIFEST.md` containing every documentation file with:

- current path;
- proposed path;
- document type;
- current status;
- proposed status;
- owner;
- source-of-truth flag;
- reason for placement;
- conflicts or uncertainty;
- inbound links that must be repaired.

Do not move anything until the inventory is complete.

### Phase 2 — Conflict and duplicate review

Identify:

- duplicate documents;
- stale snapshots;
- conflicting source-of-truth claims;
- files with no owner or status;
- historical files that look current;
- links that will break after moves.

Preserve all duplicates. Choose one current authority only when existing source-of-truth evidence supports it. Mark the others `Deprecated`, `Archived`, or `Review` and point them to the replacement where possible.

### Phase 3 — Relocation

Move files with `git mv` according to the approved structure.

For each move:

- preserve filename unless renaming materially improves clarity;
- update all Markdown links and path references;
- update scripts/config references only when they point to documentation paths;
- do not alter runtime logic;
- keep a complete old-path → new-path mapping in the manifest.

### Phase 4 — Full reread and status assignment

Reread every moved and retained document in its new context.

Every strategic or operational Markdown document must have:

```yaml
---
title:
owner:
status:
source_of_truth:
last_review:
next_review:
---
```

Allowed statuses:

```text
Draft
Review
Approved
Active
Deprecated
Archived
```

Status rules:

- `Draft`: incomplete work; not authoritative.
- `Review`: complete enough for human review, but unresolved or unapproved.
- `Approved`: accepted reference, not necessarily the active operational authority.
- `Active`: current working authority, supported by present project reality.
- `Deprecated`: preserved but replaced or unsafe for new work; include replacement link.
- `Archived`: historical evidence only.

Use `source_of_truth: true` only for `Active` or `Approved` documents that are registered in `DOCS_INDEX.md` and have no unresolved conflict with current code, schema, product scope, or higher-priority documents.

### Phase 5 — Registry repair

Update in the same branch:

- `DOCS_INDEX.md` with every new path, owner, status, source-of-truth flag, and known conflict;
- `docs/audit/KNOWLEDGE_DEBT.md` for newly discovered or resolved documentation debt;
- all README/index files inside moved folders;
- references in onboarding, governance, reports, proposals, and Bible files;
- export/include documentation when paths change.

Do not close Knowledge Debt merely because a file moved. Close it only when the underlying conflict is actually resolved and evidence is recorded.

### Phase 6 — Validation

Required checks:

```text
1. No documentation file lost.
2. No file deleted.
3. Every old path is mapped to a new or retained path.
4. All internal Markdown links resolve.
5. Every strategic/operational document has valid metadata.
6. Every Active source-of-truth document is registered in DOCS_INDEX.md.
7. Deprecated documents point to replacements where possible.
8. No protected code, Auth, RLS, SQL, migration, secret, or deployment behavior changed.
9. git diff --check passes.
```

Docs-only work does not require application build checks unless a script, config, package file, or runtime reference is changed. If any such file changes, run:

```text
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run test
```

## Deliverables

1. Reorganized documentation tree.
2. `docs/audit/DOCUMENTATION_2_0_MOVE_MANIFEST.md`.
3. Updated `DOCS_INDEX.md`.
4. Updated `docs/audit/KNOWLEDGE_DEBT.md`.
5. Valid metadata and statuses across all strategic/operational documents.
6. `docs/reports/2026-07-12-agent-report-librarian-documentation-2-0.md` with:
   - task;
   - files inspected;
   - files moved;
   - links repaired;
   - status changes;
   - unresolved conflicts;
   - validation results;
   - next step.

## Stop conditions

Stop and leave the document at `Review` when:

- two current documents claim the same authority;
- code/schema evidence contradicts documentation;
- a move would affect runtime, deployment, Supabase, Auth, RLS, SQL, migrations, or secrets;
- a canonical destination is unclear;
- a file appears generated but provenance cannot be proven;
- a link target cannot be safely resolved.

Record every stop condition in the manifest and Agent Report. Do not delete, guess, or conceal uncertainty.

## Completion condition

The mission is complete only when all documentation is preserved, every file has an intentional location, all links are repaired, statuses are evidence-based, registries are synchronized, and the Draft PR clearly lists unresolved conflicts for human review.
