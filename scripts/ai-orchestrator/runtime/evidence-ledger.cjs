const { OrchestratorError, sha256, stableStringify } = require('./core.cjs');

const SOURCE_TYPES = Object.freeze([
  'github',
  'n8n',
  'google_drive',
  'clickup',
  'runtime',
  'qa',
  'production',
]);

const VERIFICATION_STATUSES = Object.freeze(['verified', 'partial', 'blocked']);

const CLAIM_DEFINITIONS = Object.freeze({
  mission_approved: 'Mission approval is recorded.',
  context_bounded: 'The Context Pack is bounded and hashed.',
  independent_review_passed: 'Independent review passed.',
  reviewed_qa_passed: 'Reviewed-diff QA passed.',
  change_approved: 'Change Approval is recorded.',
});

const REQUIRED_RUNTIME_CLAIMS = Object.freeze(Object.keys(CLAIM_DEFINITIONS));
const EVIDENCE_KEYS = Object.freeze([
  'evidence_id',
  'source_type',
  'source_ref',
  'captured_at',
  'mission_id',
  'execution_id',
  'authority_rank',
  'content_hash',
  'verification_status',
  'claim_ids',
]);

const EVIDENCE_ID_PATTERN = /^EVIDENCE-[A-F0-9]{16}$/;
const MISSION_ID_PATTERN = /^MISSION-[A-Za-z0-9._-]+$/;
const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,299}$/;
const CLAIM_ID_PATTERN = /^[a-z][a-z0-9_]{0,79}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

function assertExactKeys(value, allowedKeys, code) {
  const unknown = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknown.length > 0) {
    throw new OrchestratorError(code, 'Evidence contains unsupported fields.', { fields: unknown.sort() });
  }
}

function isIsoTimestamp(value) {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function validateEvidenceEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new OrchestratorError('EVIDENCE_ENTRY_INVALID', 'Evidence entry must be an object.');
  }
  assertExactKeys(entry, EVIDENCE_KEYS, 'EVIDENCE_ENTRY_FIELDS_INVALID');
  if (!EVIDENCE_ID_PATTERN.test(entry.evidence_id)) {
    throw new OrchestratorError('EVIDENCE_ID_INVALID', 'Evidence ID is invalid.');
  }
  if (!SOURCE_TYPES.includes(entry.source_type)) {
    throw new OrchestratorError('EVIDENCE_SOURCE_TYPE_INVALID', 'Evidence source type is invalid.');
  }
  if (!REFERENCE_PATTERN.test(entry.source_ref)) {
    throw new OrchestratorError('EVIDENCE_SOURCE_REF_INVALID', 'Evidence source reference is invalid.');
  }
  if (!isIsoTimestamp(entry.captured_at)) {
    throw new OrchestratorError('EVIDENCE_CAPTURED_AT_INVALID', 'Evidence captured_at must be an ISO timestamp.');
  }
  if (!MISSION_ID_PATTERN.test(entry.mission_id)) {
    throw new OrchestratorError('EVIDENCE_MISSION_ID_INVALID', 'Evidence Mission ID is invalid.');
  }
  if (!REFERENCE_PATTERN.test(entry.execution_id)) {
    throw new OrchestratorError('EVIDENCE_EXECUTION_ID_INVALID', 'Evidence execution ID is invalid.');
  }
  if (!Number.isInteger(entry.authority_rank) || entry.authority_rank < 0 || entry.authority_rank > 100) {
    throw new OrchestratorError('EVIDENCE_AUTHORITY_RANK_INVALID', 'Evidence authority rank must be an integer from 0 to 100.');
  }
  if (!HASH_PATTERN.test(entry.content_hash)) {
    throw new OrchestratorError('EVIDENCE_CONTENT_HASH_INVALID', 'Evidence content hash must be SHA-256.');
  }
  if (!VERIFICATION_STATUSES.includes(entry.verification_status)) {
    throw new OrchestratorError('EVIDENCE_VERIFICATION_STATUS_INVALID', 'Evidence verification status is invalid.');
  }
  if (!Array.isArray(entry.claim_ids)
      || entry.claim_ids.length === 0
      || new Set(entry.claim_ids).size !== entry.claim_ids.length
      || entry.claim_ids.some((claimId) => !CLAIM_ID_PATTERN.test(claimId))) {
    throw new OrchestratorError('EVIDENCE_CLAIM_LINK_INVALID', 'Evidence claim linkage is invalid.');
  }
  return entry;
}

function createEvidenceEntry({
  sourceType,
  sourceRef,
  capturedAt,
  missionId,
  executionId,
  authorityRank,
  contentHash,
  verificationStatus = 'verified',
  claimIds,
}) {
  const identity = {
    source_type: sourceType,
    source_ref: sourceRef,
    captured_at: capturedAt,
    mission_id: missionId,
    execution_id: executionId,
    authority_rank: authorityRank,
    content_hash: contentHash,
    verification_status: verificationStatus,
    claim_ids: [...claimIds].sort(),
  };
  return validateEvidenceEntry({
    evidence_id: `EVIDENCE-${sha256(stableStringify(identity)).slice(0, 16).toUpperCase()}`,
    ...identity,
  });
}

function validateRequiredClaims(requiredClaimIds) {
  if (!Array.isArray(requiredClaimIds)
      || requiredClaimIds.length === 0
      || new Set(requiredClaimIds).size !== requiredClaimIds.length
      || requiredClaimIds.some((claimId) => !CLAIM_ID_PATTERN.test(claimId))) {
    throw new OrchestratorError('EVIDENCE_REQUIRED_CLAIMS_INVALID', 'Required evidence claims are invalid.');
  }
}

function buildEvidenceManifest({ missionId, generatedAt, requiredClaimIds, entries }) {
  if (!MISSION_ID_PATTERN.test(missionId)) {
    throw new OrchestratorError('EVIDENCE_MISSION_ID_INVALID', 'Evidence manifest Mission ID is invalid.');
  }
  if (!isIsoTimestamp(generatedAt)) {
    throw new OrchestratorError('EVIDENCE_GENERATED_AT_INVALID', 'Evidence manifest generated_at must be an ISO timestamp.');
  }
  validateRequiredClaims(requiredClaimIds);
  if (!Array.isArray(entries)) {
    throw new OrchestratorError('EVIDENCE_ENTRIES_INVALID', 'Evidence entries must be an array.');
  }

  const normalized = entries.map(validateEvidenceEntry);
  const ids = normalized.map((entry) => entry.evidence_id);
  if (new Set(ids).size !== ids.length) {
    throw new OrchestratorError('EVIDENCE_ID_DUPLICATE', 'Evidence IDs must be unique.');
  }
  const wrongMission = normalized.filter((entry) => entry.mission_id !== missionId).map((entry) => entry.evidence_id);
  if (wrongMission.length > 0) {
    throw new OrchestratorError('EVIDENCE_MISSION_MISMATCH', 'Evidence entry belongs to another Mission.', {
      evidence_ids: wrongMission,
    });
  }

  const verifiedClaims = new Set(normalized
    .filter((entry) => entry.verification_status === 'verified')
    .flatMap((entry) => entry.claim_ids));
  const missingClaimIds = requiredClaimIds.filter((claimId) => !verifiedClaims.has(claimId));
  const hasBlockedRequiredClaim = normalized.some((entry) => entry.verification_status === 'blocked'
    && entry.claim_ids.some((claimId) => missingClaimIds.includes(claimId)));
  const status = missingClaimIds.length === 0
    ? 'COMPLETED'
    : entries.length === 0 || hasBlockedRequiredClaim ? 'BLOCKED' : 'PARTIAL';

  return {
    schema_version: '1.0',
    mission_id: missionId,
    generated_at: generatedAt,
    status,
    required_claim_ids: [...requiredClaimIds],
    missing_claim_ids: missingClaimIds,
    entries: [...normalized].sort((left, right) => left.authority_rank - right.authority_rank
      || left.evidence_id.localeCompare(right.evidence_id)),
  };
}

function stateTimestamp(record, stateName) {
  return record.history?.find((entry) => entry.state === stateName)?.at;
}

function buildRuntimeMissionEvidenceManifest(record, generatedAt = new Date().toISOString()) {
  if (!record?.mission || !MISSION_ID_PATTERN.test(record.mission.mission_id)) {
    throw new OrchestratorError('EVIDENCE_RECORD_INVALID', 'Mission record is invalid.');
  }
  const missionId = record.mission.mission_id;
  const entries = [];

  if (record.mission_approval?.approved_at && record.payload_hash) {
    entries.push(createEvidenceEntry({
      sourceType: 'runtime',
      sourceRef: `mission:${missionId}`,
      capturedAt: record.mission_approval.approved_at,
      missionId,
      executionId: 'mission-approval',
      authorityRank: 10,
      contentHash: sha256(stableStringify({
        payload_hash: record.payload_hash,
        mission_approval: record.mission_approval,
      })),
      claimIds: ['mission_approved'],
    }));
  }

  if (record.artifacts?.context_pack?.sha256) {
    entries.push(createEvidenceEntry({
      sourceType: 'runtime',
      sourceRef: 'artifact:context-pack',
      capturedAt: stateTimestamp(record, 'context_ready') || record.updated_at,
      missionId,
      executionId: 'context-build',
      authorityRank: 20,
      contentHash: record.artifacts.context_pack.sha256,
      claimIds: ['context_bounded'],
    }));
  }

  const reviewer = record.agent_executions?.reviewer;
  if (reviewer?.result?.status === 'PASS' && reviewer.received_at) {
    entries.push(createEvidenceEntry({
      sourceType: 'runtime',
      sourceRef: 'execution:independent-review',
      capturedAt: reviewer.received_at,
      missionId,
      executionId: reviewer.execution_id,
      authorityRank: 30,
      contentHash: sha256(stableStringify(reviewer.result)),
      claimIds: ['independent_review_passed'],
    }));
  }

  const reviewedQa = record.checks?.reviewed_diff;
  if (reviewedQa?.green === true && reviewedQa.completed_at) {
    entries.push(createEvidenceEntry({
      sourceType: 'qa',
      sourceRef: 'qa:reviewed-diff',
      capturedAt: reviewedQa.completed_at,
      missionId,
      executionId: 'qa-reviewed-diff',
      authorityRank: 30,
      contentHash: sha256(stableStringify(reviewedQa)),
      claimIds: ['reviewed_qa_passed'],
    }));
  }

  if (record.change_approval?.approved_at) {
    entries.push(createEvidenceEntry({
      sourceType: 'runtime',
      sourceRef: 'approval:change',
      capturedAt: record.change_approval.approved_at,
      missionId,
      executionId: 'change-approval',
      authorityRank: 10,
      contentHash: sha256(stableStringify(record.change_approval)),
      claimIds: ['change_approved'],
    }));
  }

  return buildEvidenceManifest({
    missionId,
    generatedAt,
    requiredClaimIds: REQUIRED_RUNTIME_CLAIMS,
    entries,
  });
}

function formatEvidenceLedger(manifest) {
  const rows = manifest.required_claim_ids.map((claimId) => {
    const evidence = manifest.entries.filter((entry) => entry.verification_status === 'verified'
      && entry.claim_ids.includes(claimId));
    const evidenceIds = evidence.map((entry) => entry.evidence_id).join(', ') || 'MISSING';
    const scope = evidence.map((entry) => entry.source_ref).join(', ') || `mission:${manifest.mission_id}`;
    return `| ${CLAIM_DEFINITIONS[claimId] || claimId} | ${evidenceIds} | ${scope} |`;
  });
  return [
    '## Evidence ledger',
    '',
    '| Claim | Evidence | Scope |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n');
}

module.exports = {
  CLAIM_DEFINITIONS,
  REQUIRED_RUNTIME_CLAIMS,
  SOURCE_TYPES,
  VERIFICATION_STATUSES,
  buildEvidenceManifest,
  buildRuntimeMissionEvidenceManifest,
  createEvidenceEntry,
  formatEvidenceLedger,
  validateEvidenceEntry,
};
