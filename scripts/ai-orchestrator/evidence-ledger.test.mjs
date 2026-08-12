import { describe, expect, it } from 'vitest';
import core from './runtime/core.cjs';
import ledger from './runtime/evidence-ledger.cjs';

const capturedAt = '2026-08-12T12:00:00.000Z';

function entry({
  claimId = 'mission_approved',
  sourceRef = 'mission:MISSION-AO-300',
  verificationStatus = 'verified',
} = {}) {
  return ledger.createEvidenceEntry({
    sourceType: 'runtime',
    sourceRef,
    capturedAt,
    missionId: 'MISSION-AO-300',
    executionId: 'execution-1',
    authorityRank: 10,
    contentHash: core.sha256(sourceRef),
    verificationStatus,
    claimIds: [claimId],
  });
}

describe('AO-300 Evidence Ledger', () => {
  it('creates deterministic normalized evidence IDs without storing source content', () => {
    const first = entry();
    const second = entry();
    expect(first).toEqual(second);
    expect(first.evidence_id).toMatch(/^EVIDENCE-[A-F0-9]{16}$/);
    expect(first).not.toHaveProperty('content');
    expect(first).not.toHaveProperty('excerpt');
    expect(first).not.toHaveProperty('stdout');
    expect(first).not.toHaveProperty('stderr');
  });

  it('marks a manifest COMPLETED only when every required claim has verified evidence', () => {
    const requiredClaimIds = ['mission_approved', 'reviewed_qa_passed'];
    const manifest = ledger.buildEvidenceManifest({
      missionId: 'MISSION-AO-300',
      generatedAt: capturedAt,
      requiredClaimIds,
      entries: [
        entry(),
        entry({ claimId: 'reviewed_qa_passed', sourceRef: 'qa:reviewed-diff' }),
      ],
    });
    expect(manifest.status).toBe('COMPLETED');
    expect(manifest.missing_claim_ids).toEqual([]);
  });

  it('downgrades missing verification to PARTIAL or BLOCKED', () => {
    const partial = ledger.buildEvidenceManifest({
      missionId: 'MISSION-AO-300',
      generatedAt: capturedAt,
      requiredClaimIds: ['mission_approved', 'reviewed_qa_passed'],
      entries: [entry()],
    });
    expect(partial.status).toBe('PARTIAL');
    expect(partial.missing_claim_ids).toEqual(['reviewed_qa_passed']);

    const blocked = ledger.buildEvidenceManifest({
      missionId: 'MISSION-AO-300',
      generatedAt: capturedAt,
      requiredClaimIds: ['reviewed_qa_passed'],
      entries: [entry({
        claimId: 'reviewed_qa_passed',
        sourceRef: 'qa:reviewed-diff',
        verificationStatus: 'blocked',
      })],
    });
    expect(blocked.status).toBe('BLOCKED');
  });

  it('rejects cross-Mission evidence and unsupported raw fields', () => {
    const mismatched = { ...entry(), mission_id: 'MISSION-OTHER' };
    expect(() => ledger.buildEvidenceManifest({
      missionId: 'MISSION-AO-300',
      generatedAt: capturedAt,
      requiredClaimIds: ['mission_approved'],
      entries: [mismatched],
    })).toThrowError(expect.objectContaining({ code: 'EVIDENCE_MISSION_MISMATCH' }));

    expect(() => ledger.validateEvidenceEntry({ ...entry(), stdout: 'secret-like log' }))
      .toThrowError(expect.objectContaining({ code: 'EVIDENCE_ENTRY_FIELDS_INVALID' }));
  });
});
