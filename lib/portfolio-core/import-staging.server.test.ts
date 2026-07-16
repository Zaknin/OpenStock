import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildImportPlan, type FixturePack, type SourceCell } from './import-planner';
import { sanitizedInspectionOutput, sanitizedPersistOutput } from './import-staging-cli';
import { assertUniqueStagingDocuments, createStagingDocuments, IMPORT_STAGING_COLLECTIONS, InMemoryImportStagingRepository } from './import-staging.server';

const fixturePath = path.resolve(process.cwd(), 'test/fixtures/portfolio-core/synthetic-import-fixture.json');

async function fixture(): Promise<FixturePack> { return JSON.parse(await readFile(fixturePath, 'utf8')) as FixturePack; }
async function plan(): Promise<ReturnType<typeof buildImportPlan>> { return buildImportPlan(await fixture(), { strict: false }); }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function setCellValue(input: FixturePack, row: number, column: string, value: string): void { const rows = input.tradeLog.transactions as { cells: SourceCell[] }[]; const cell = rows.flatMap((entry) => entry.cells).find((item) => item.source.row === row && item.source.column === column); if (cell === undefined) throw new Error('Synthetic cell missing.'); (cell as { original_value: string | null; formula: string | null; cached_value: string | null }).original_value = value; (cell as { formula: string | null }).formula = null; (cell as { cached_value: string | null }).cached_value = null; }

describe('Portfolio Core staging persistence', () => {
  it('persists deterministic staging records with complete provenance and no accounting entities', async () => {
    const importPlan = await plan(); const repository = new InMemoryImportStagingRepository(); const result = await repository.persist(importPlan); const inspection = await repository.inspect(result.batchId);
    expect(result.idempotent).toBe(false); expect(repository.masters.size).toBe(importPlan.currencies.length + importPlan.accounts.length + importPlan.categories.length + importPlan.instruments.length + importPlan.aliases.length + 1); expect(repository.transactions.size).toBe(importPlan.transactions.length); expect(repository.issues.size).toBe(importPlan.exceptions.length + importPlan.warnings.length); expect(inspection.provenanceComplete).toBe(true); expect(Object.values(IMPORT_STAGING_COLLECTIONS)).not.toContain('portfolios'); expect(Object.values(IMPORT_STAGING_COLLECTIONS)).not.toContain('accounts');
  });

  it('is idempotent for an identical plan and stages a changed plan separately', async () => {
    const firstPlan = await plan(); const repository = new InMemoryImportStagingRepository(); const first = await repository.persist(firstPlan); const repeated = await repository.persist(firstPlan); const changedInput = clone(await fixture()); setCellValue(changedInput, 7, 'G', '18.50'); const changedPlan = buildImportPlan(changedInput, { strict: false }); const changed = await repository.persist(changedPlan);
    expect(repeated).toMatchObject({ batchId: first.batchId, idempotent: true, transactionMode: 'existing' }); expect(changed.batchId).not.toBe(first.batchId); expect(repository.batches.size).toBe(2); expect(repository.masters.size).toBeGreaterThan(firstPlan.currencies.length);
  });

  it('rejects duplicate deterministic proposal and issue IDs before any write', async () => {
    const documents = createStagingDocuments(await plan()); const duplicateMaster = { ...documents, masters: [...documents.masters, documents.masters[0]] }; const duplicateIssue = { ...documents, issues: [...documents.issues, documents.issues[0]] };
    expect(() => assertUniqueStagingDocuments(duplicateMaster)).toThrow('Duplicate deterministic staging identity.'); expect(() => assertUniqueStagingDocuments(duplicateIssue)).toThrow('Duplicate deterministic staging identity.');
  });

  it('cleans up every staging record after a partial write failure', async () => {
    const repository = new InMemoryImportStagingRepository('after_transactions'); await expect(repository.persist(await plan())).rejects.toThrow('Injected staging failure.'); expect(repository.batches.size).toBe(0); expect(repository.masters.size).toBe(0); expect(repository.transactions.size).toBe(0); expect(repository.issues.size).toBe(0); expect(repository.auditEvents.size).toBe(0);
  });

  it('keeps raw proposal evidence immutable while recording allowed issue dispositions', async () => {
    const repository = new InMemoryImportStagingRepository(); const result = await repository.persist(await plan()); const issue = [...repository.issues.values()].find((item) => item.severity === 'blocking'); if (issue === undefined) throw new Error('Expected synthetic blocking issue.'); const proposal = [...repository.masters.values(), ...repository.transactions.values()].find((item) => item.proposalId === issue.proposalId); const before = JSON.stringify(proposal); await repository.transitionIssue(issue.issueId, 'acknowledged', { reasonCode: 'reviewed', actorId: 'tester_1' }); await repository.transitionIssue(issue.issueId, 'accepted-as-source', { reasonCode: 'source_evidence', actorId: 'tester_1' }); expect(JSON.stringify([...repository.masters.values(), ...repository.transactions.values()].find((item) => item.proposalId === issue.proposalId))).toBe(before); await expect(repository.transitionIssue(issue.issueId, 'acknowledged')).rejects.toThrow('Invalid import issue lifecycle transition.'); expect(result.status).toBe('completed_with_blocking_issues');
  });

  it('accepts every allowed disposition target and retains blocking validation codes', async () => {
    const allowed = ['acknowledged', 'accepted-as-source', 'corrected-by-amendment', 'rejected', 'superseded'] as const;
    for (const status of allowed) { const repository = new InMemoryImportStagingRepository(); await repository.persist(await plan()); const issue = [...repository.issues.values()].find((item) => item.severity === 'blocking'); if (issue === undefined) throw new Error('Expected synthetic blocking issue.'); const result = await repository.transitionIssue(issue.issueId, status, { reasonCode: 'reviewed' }); expect(result.resolutionStatus).toBe(status); }
    const input = clone(await fixture()); setCellValue(input, 6, 'I', 'Unknown account'); setCellValue(input, 7, 'G', '18.50'); const blockingPlan = buildImportPlan(input, { strict: false }); const codes = new Set(blockingPlan.exceptions.map((item) => item.code)); expect(codes).toContain('UNKNOWN_ACCOUNT'); expect(codes).toContain('GROSS_AMOUNT_INCONSISTENCY');
  });

  it('formats CLI summaries without synthetic source values', async () => {
    const importPlan = await plan(); const repository = new InMemoryImportStagingRepository(); const result = await repository.persist(importPlan); const output = sanitizedPersistOutput(importPlan, result, 'persist'); const inspection = sanitizedInspectionOutput(await repository.inspect(result.batchId));
    for (const forbidden of ['Account Alpha', 'Account Beta', 'ORBIT', 'PENNYQ', '125.00', '12.50', '1.00']) { expect(output).not.toContain(forbidden); expect(inspection).not.toContain(forbidden); }
  });
});
