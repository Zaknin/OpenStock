import { createHash, randomUUID } from 'node:crypto';
import type { ClientSession, Db, MongoClient } from 'mongodb';
import type { ImportPlan, ImportWarning, Provenance } from './import-planner';

export const IMPORT_STAGING_COLLECTIONS = {
  batches: 'portfolioImportBatches', masters: 'portfolioImportMasterProposals', transactions: 'portfolioImportTransactionProposals', issues: 'portfolioImportIssues', auditEvents: 'portfolioImportAuditEvents',
} as const;

export type ImportBatchStatus = 'writing' | 'completed' | 'completed_with_blocking_issues';
export type ImportIssueSeverity = 'blocking' | 'warning';
export type ImportIssueResolutionStatus = 'open' | 'acknowledged' | 'accepted-as-source' | 'corrected-by-amendment' | 'rejected' | 'superseded';
export type SanitizedDisposition = Readonly<{ reasonCode?: string; amendmentProposalId?: string; actorId?: string }>;
export type StagingTransactionMode = 'transaction' | 'compensating' | 'existing';

export type ImportBatchRecord = Readonly<{
  batchId: string; sourceWorkbookHash: string; fixtureManifestHash: string; plannerVersion: string; planHash: string;
  mode: 'strict' | 'non-strict'; status: ImportBatchStatus; createdAt: Date; completedAt: Date | null;
  sanitizedCounts: ImportPlan['summary']; supersedesBatchId: string | null; replacesBatchId: string | null;
}>;
export type ImportMasterProposalRecord = Readonly<{
  proposalId: string; batchId: string; proposalType: 'portfolio' | 'currency' | 'account' | 'category' | 'instrument' | 'instrument_alias'; normalizedPayload: unknown;
  provenance: Provenance; validationStatus: 'valid' | 'has_issues'; resolutionStatus: 'unresolved';
}>;
export type ImportTransactionProposalRecord = Readonly<{
  proposalId: string; batchId: string; sourceSheet: string; sourceRow: number; sourceSequence: number | null;
  rawTransactionPayload: unknown; normalizedProposalPayload: unknown; provenance: Provenance; validationStatus: 'valid' | 'has_issues'; resolutionStatus: 'unresolved';
}>;
export type ImportIssueRecord = Readonly<{
  issueId: string; batchId: string; proposalId: string | null; severity: ImportIssueSeverity; code: string;
  sanitizedFieldIdentifiers: readonly string[]; provenance: Provenance; resolutionStatus: ImportIssueResolutionStatus; disposition: SanitizedDisposition | null;
}>;
export type ImportAuditEventRecord = Readonly<{
  eventId: string; batchId: string; issueId: string | null; eventType: 'batch_persisted' | 'issue_transitioned'; timestamp: Date;
  actorId: string | null; sanitizedMetadata: Readonly<Record<string, string | number | boolean | null>>;
}>;
export type StagingDocuments = Readonly<{
  batch: ImportBatchRecord; masters: readonly ImportMasterProposalRecord[]; transactions: readonly ImportTransactionProposalRecord[];
  issues: readonly ImportIssueRecord[]; audit: ImportAuditEventRecord;
}>;
export type PersistImportPlanResult = Readonly<{
  batchId: string; planHash: string; idempotent: boolean; status: ImportBatchStatus; transactionMode: StagingTransactionMode;
}>;
export type ImportBatchInspection = Readonly<{
  batchId: string; status: ImportBatchStatus; proposalCounts: Readonly<Record<string, number>>; issueCountsByCode: Readonly<Record<string, number>>;
  issueCountsBySeverity: Readonly<Record<string, number>>; unresolvedIssueCount: number; planHashPrefix: string; provenanceComplete: boolean; idempotencyStatus: 'existing_batch' | 'unique_batch';
}>;

function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function counts(values: readonly string[]): Readonly<Record<string, number>> { return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length])); }
function fieldIdentifiers(provenance: Provenance): readonly string[] { return [...new Set(provenance.cells.map((cell) => cell.source.column))].sort(); }
function validationStatus(proposalId: string, issues: readonly ImportIssueRecord[]): 'valid' | 'has_issues' { return issues.some((issue) => issue.proposalId === proposalId) ? 'has_issues' : 'valid'; }
function isCompleteProvenance(provenance: Provenance): boolean { return typeof provenance.provenanceHash === 'string' && provenance.provenanceHash.length > 0 && typeof provenance.sourceWorkbookHash === 'string' && provenance.sourceWorkbookHash.length > 0 && typeof provenance.extractorVersion === 'string' && provenance.extractorVersion.length > 0 && typeof provenance.sourceSheet === 'string' && Array.isArray(provenance.cells); }
function recordKey(batchId: string, id: string): string { return `${batchId}:${id}`; }

function mapWarnings(warnings: readonly ImportWarning[]): readonly ImportIssueRecord[] {
  return warnings.map((warning) => ({ issueId: warning.id, batchId: '', proposalId: warning.subjectId, severity: 'warning', code: warning.code, sanitizedFieldIdentifiers: fieldIdentifiers(warning.provenance), provenance: warning.provenance, resolutionStatus: 'open', disposition: null }));
}

export function createStagingDocuments(plan: ImportPlan, now: Date = new Date()): StagingDocuments {
  const initialIssues = [...plan.exceptions.map((issue) => ({ issueId: issue.id, batchId: plan.manifest.id, proposalId: issue.subjectId, severity: 'blocking' as const, code: issue.code, sanitizedFieldIdentifiers: fieldIdentifiers(issue.provenance), provenance: issue.provenance, resolutionStatus: 'open' as const, disposition: null })), ...mapWarnings(plan.warnings).map((issue) => ({ ...issue, batchId: plan.manifest.id }))];
  const rawToTransaction = new Map(plan.transactions.map((transaction) => [transaction.rawInputId, transaction.id]));
  const issues = initialIssues.map((issue) => ({ ...issue, proposalId: issue.proposalId === null ? null : rawToTransaction.get(issue.proposalId) ?? issue.proposalId }));
  const masterInputs: readonly (readonly [ImportMasterProposalRecord['proposalType'], { id: string; provenance: Provenance }])[] = [
    ['portfolio', plan.portfolio], ...plan.currencies.map((item) => ['currency', item] as const), ...plan.accounts.map((item) => ['account', item] as const), ...plan.categories.map((item) => ['category', item] as const), ...plan.instruments.map((item) => ['instrument', item] as const), ...plan.aliases.map((item) => ['instrument_alias', item] as const),
  ];
  const masters = masterInputs.map(([proposalType, proposal]) => ({ proposalId: proposal.id, batchId: plan.manifest.id, proposalType, normalizedPayload: proposal, provenance: proposal.provenance, validationStatus: validationStatus(proposal.id, issues), resolutionStatus: 'unresolved' as const }));
  const transactions = plan.transactions.map((proposal) => ({ proposalId: proposal.id, batchId: plan.manifest.id, sourceSheet: proposal.raw.sourceSheet, sourceRow: proposal.raw.sourceRow, sourceSequence: proposal.raw.sourceSequence, rawTransactionPayload: proposal.raw, normalizedProposalPayload: proposal, provenance: proposal.provenance, validationStatus: validationStatus(proposal.id, issues), resolutionStatus: 'unresolved' as const }));
  const batch: ImportBatchRecord = { batchId: plan.manifest.id, sourceWorkbookHash: plan.manifest.sourceWorkbookHash, fixtureManifestHash: plan.manifest.provenance.manifestHash, plannerVersion: plan.manifest.plannerVersion, planHash: plan.manifest.planHash, mode: plan.manifest.mode, status: plan.summary.exceptionCount > 0 ? 'completed_with_blocking_issues' : 'completed', createdAt: now, completedAt: now, sanitizedCounts: plan.summary, supersedesBatchId: null, replacesBatchId: null };
  const audit: ImportAuditEventRecord = { eventId: `audit_${hash({ batchId: batch.batchId, eventType: 'batch_persisted', planHash: batch.planHash }).slice(0, 24)}`, batchId: batch.batchId, issueId: null, eventType: 'batch_persisted', timestamp: now, actorId: null, sanitizedMetadata: { masterCount: masters.length, transactionCount: transactions.length, issueCount: issues.length, blockingIssueCount: issues.filter((issue) => issue.severity === 'blocking').length } };
  return { batch, masters, transactions, issues, audit };
}

export function assertUniqueStagingDocuments(documents: StagingDocuments): void {
  const unique = (values: readonly string[]): void => { if (new Set(values).size !== values.length) throw new Error('Duplicate deterministic staging identity.'); };
  unique(documents.masters.map((record) => record.proposalId)); unique(documents.transactions.map((record) => record.proposalId)); unique(documents.issues.map((record) => record.issueId));
}

const allowedTransitions: Readonly<Record<ImportIssueResolutionStatus, readonly ImportIssueResolutionStatus[]>> = {
  open: ['acknowledged', 'accepted-as-source', 'corrected-by-amendment', 'rejected', 'superseded'], acknowledged: ['accepted-as-source', 'corrected-by-amendment', 'rejected', 'superseded'], 'accepted-as-source': ['superseded'], 'corrected-by-amendment': ['superseded'], rejected: ['superseded'], superseded: [],
};
function validateDisposition(disposition: SanitizedDisposition | undefined): SanitizedDisposition | null {
  if (disposition === undefined) return null;
  for (const [key, value] of Object.entries(disposition)) if (!['reasonCode', 'amendmentProposalId', 'actorId'].includes(key) || typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(value)) throw new TypeError('Issue disposition metadata is not sanitized.');
  return disposition;
}
function transitionAllowed(current: ImportIssueResolutionStatus, next: ImportIssueResolutionStatus): void { if (!allowedTransitions[current].includes(next)) throw new RangeError('Invalid import issue lifecycle transition.'); }
function eventForTransition(issue: ImportIssueRecord, status: ImportIssueResolutionStatus, disposition: SanitizedDisposition | null, now: Date): ImportAuditEventRecord { return { eventId: `audit_${randomUUID()}`, batchId: issue.batchId, issueId: issue.issueId, eventType: 'issue_transitioned', timestamp: now, actorId: disposition?.actorId ?? null, sanitizedMetadata: { from: issue.resolutionStatus, to: status, reasonCode: disposition?.reasonCode ?? null, amendmentProposalId: disposition?.amendmentProposalId ?? null } }; }

export class InMemoryImportStagingRepository {
  readonly batches = new Map<string, ImportBatchRecord>(); readonly masters = new Map<string, ImportMasterProposalRecord>(); readonly transactions = new Map<string, ImportTransactionProposalRecord>(); readonly issues = new Map<string, ImportIssueRecord>(); readonly auditEvents = new Map<string, ImportAuditEventRecord>();
  private readonly failurePoint: 'after_batch' | 'after_masters' | 'after_transactions' | 'after_issues' | null;
  constructor(failurePoint: 'after_batch' | 'after_masters' | 'after_transactions' | 'after_issues' | null = null) { this.failurePoint = failurePoint; }
  async persist(plan: ImportPlan): Promise<PersistImportPlanResult> {
    const existing = [...this.batches.values()].find((batch) => batch.sourceWorkbookHash === plan.manifest.sourceWorkbookHash && batch.planHash === plan.manifest.planHash);
    if (existing !== undefined) return { batchId: existing.batchId, planHash: existing.planHash, idempotent: true, status: existing.status, transactionMode: 'existing' };
    const documents = createStagingDocuments(plan); assertUniqueStagingDocuments(documents); const cleanup = (): void => { this.batches.delete(documents.batch.batchId); documents.masters.forEach((record) => this.masters.delete(recordKey(record.batchId, record.proposalId))); documents.transactions.forEach((record) => this.transactions.delete(recordKey(record.batchId, record.proposalId))); documents.issues.forEach((record) => this.issues.delete(recordKey(record.batchId, record.issueId))); this.auditEvents.delete(documents.audit.eventId); };
    try { this.batches.set(documents.batch.batchId, { ...documents.batch, status: 'writing', completedAt: null }); if (this.failurePoint === 'after_batch') throw new Error('Injected staging failure.'); documents.masters.forEach((record) => { const key = recordKey(record.batchId, record.proposalId); if (this.masters.has(key)) throw new Error('Duplicate master proposal ID.'); this.masters.set(key, record); }); if (this.failurePoint === 'after_masters') throw new Error('Injected staging failure.'); documents.transactions.forEach((record) => { const key = recordKey(record.batchId, record.proposalId); if (this.transactions.has(key)) throw new Error('Duplicate transaction proposal ID.'); this.transactions.set(key, record); }); if (this.failurePoint === 'after_transactions') throw new Error('Injected staging failure.'); documents.issues.forEach((record) => { const key = recordKey(record.batchId, record.issueId); if (this.issues.has(key)) throw new Error('Duplicate issue ID.'); this.issues.set(key, record); }); if (this.failurePoint === 'after_issues') throw new Error('Injected staging failure.'); this.auditEvents.set(documents.audit.eventId, documents.audit); this.batches.set(documents.batch.batchId, documents.batch); return { batchId: documents.batch.batchId, planHash: documents.batch.planHash, idempotent: false, status: documents.batch.status, transactionMode: 'compensating' }; } catch (error) { cleanup(); throw error; }
  }
  async transitionIssue(issueId: string, next: ImportIssueResolutionStatus, disposition?: SanitizedDisposition): Promise<ImportIssueRecord> { const issue = [...this.issues.values()].find((item) => item.issueId === issueId); if (issue === undefined) throw new Error('Import issue does not exist.'); transitionAllowed(issue.resolutionStatus, next); const safeDisposition = validateDisposition(disposition); const updated = { ...issue, resolutionStatus: next, disposition: safeDisposition }; this.issues.set(recordKey(issue.batchId, issueId), updated); const event = eventForTransition(issue, next, safeDisposition, new Date()); this.auditEvents.set(event.eventId, event); return updated; }
  async inspect(batchId: string): Promise<ImportBatchInspection> { const batch = this.batches.get(batchId); if (batch === undefined) throw new Error('Import batch does not exist.'); const masters = [...this.masters.values()].filter((record) => record.batchId === batchId); const transactions = [...this.transactions.values()].filter((record) => record.batchId === batchId); const issues = [...this.issues.values()].filter((record) => record.batchId === batchId); return inspection(batch, masters, transactions, issues, 'unique_batch'); }
}

function transactionUnsupported(error: unknown): boolean { const message = error instanceof Error ? error.message : ''; return /Transaction numbers are only allowed|replica set|transactions are not supported/i.test(message); }
function duplicateKey(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000; }
export class MongoImportStagingRepository {
  private readonly db: Db; private readonly client: MongoClient | undefined;
  constructor(db: Db, client?: MongoClient) { this.db = db; this.client = client; }
  async ensureIndexes(): Promise<void> { await Promise.all([
    this.db.collection(IMPORT_STAGING_COLLECTIONS.batches).createIndexes([{ key: { batchId: 1 }, unique: true }, { key: { sourceWorkbookHash: 1, planHash: 1 }, unique: true }]),
    this.db.collection(IMPORT_STAGING_COLLECTIONS.masters).createIndexes([{ key: { batchId: 1, proposalId: 1 }, unique: true }, { key: { batchId: 1, proposalType: 1 } }]),
    this.db.collection(IMPORT_STAGING_COLLECTIONS.transactions).createIndexes([{ key: { batchId: 1, proposalId: 1 }, unique: true }, { key: { batchId: 1, sourceSheet: 1, sourceRow: 1, sourceSequence: 1 }, unique: true }]),
    this.db.collection(IMPORT_STAGING_COLLECTIONS.issues).createIndexes([{ key: { batchId: 1, issueId: 1 }, unique: true }, { key: { batchId: 1, resolutionStatus: 1 } }]),
    this.db.collection(IMPORT_STAGING_COLLECTIONS.auditEvents).createIndexes([{ key: { eventId: 1 }, unique: true }, { key: { batchId: 1, timestamp: 1 } }]),
  ]); }
  private async write(documents: StagingDocuments, session?: ClientSession): Promise<void> { assertUniqueStagingDocuments(documents); const options = session === undefined ? {} : { session }; const batches = this.db.collection<ImportBatchRecord>(IMPORT_STAGING_COLLECTIONS.batches); await batches.insertOne({ ...documents.batch, status: 'writing', completedAt: null }, options); await this.db.collection<ImportMasterProposalRecord>(IMPORT_STAGING_COLLECTIONS.masters).insertMany(documents.masters, options); await this.db.collection<ImportTransactionProposalRecord>(IMPORT_STAGING_COLLECTIONS.transactions).insertMany(documents.transactions, options); await this.db.collection<ImportIssueRecord>(IMPORT_STAGING_COLLECTIONS.issues).insertMany(documents.issues, options); await this.db.collection<ImportAuditEventRecord>(IMPORT_STAGING_COLLECTIONS.auditEvents).insertOne(documents.audit, options); await batches.updateOne({ batchId: documents.batch.batchId }, { $set: { status: documents.batch.status, completedAt: documents.batch.completedAt } }, options); }
  private async cleanup(batchId: string): Promise<void> { await Promise.all([this.db.collection(IMPORT_STAGING_COLLECTIONS.auditEvents).deleteMany({ batchId }), this.db.collection(IMPORT_STAGING_COLLECTIONS.issues).deleteMany({ batchId }), this.db.collection(IMPORT_STAGING_COLLECTIONS.transactions).deleteMany({ batchId }), this.db.collection(IMPORT_STAGING_COLLECTIONS.masters).deleteMany({ batchId }), this.db.collection(IMPORT_STAGING_COLLECTIONS.batches).deleteOne({ batchId })]); }
  async persist(plan: ImportPlan): Promise<PersistImportPlanResult> { await this.ensureIndexes(); const batches = this.db.collection<ImportBatchRecord>(IMPORT_STAGING_COLLECTIONS.batches); const existing = await batches.findOne({ sourceWorkbookHash: plan.manifest.sourceWorkbookHash, planHash: plan.manifest.planHash }); if (existing !== null) return { batchId: existing.batchId, planHash: existing.planHash, idempotent: true, status: existing.status, transactionMode: 'existing' }; const documents = createStagingDocuments(plan); const existingResult = async (): Promise<PersistImportPlanResult | null> => { const concurrent = await batches.findOne({ sourceWorkbookHash: plan.manifest.sourceWorkbookHash, planHash: plan.manifest.planHash }); return concurrent === null || concurrent.batchId === documents.batch.batchId ? null : { batchId: concurrent.batchId, planHash: concurrent.planHash, idempotent: true, status: concurrent.status, transactionMode: 'existing' }; }; if (this.client !== undefined) { const session = this.client.startSession(); try { await session.withTransaction(async () => this.write(documents, session)); return { batchId: documents.batch.batchId, planHash: documents.batch.planHash, idempotent: false, status: documents.batch.status, transactionMode: 'transaction' }; } catch (error) { if (duplicateKey(error)) { const concurrent = await existingResult(); if (concurrent !== null) return concurrent; } if (!transactionUnsupported(error)) { await this.cleanup(documents.batch.batchId); throw error; } await this.cleanup(documents.batch.batchId); } finally { await session.endSession(); } } try { await this.write(documents); return { batchId: documents.batch.batchId, planHash: documents.batch.planHash, idempotent: false, status: documents.batch.status, transactionMode: 'compensating' }; } catch (error) { if (duplicateKey(error)) { const concurrent = await existingResult(); if (concurrent !== null) return concurrent; } await this.cleanup(documents.batch.batchId); throw error; } }
  async transitionIssue(issueId: string, next: ImportIssueResolutionStatus, disposition?: SanitizedDisposition): Promise<ImportIssueRecord> { const issues = this.db.collection<ImportIssueRecord>(IMPORT_STAGING_COLLECTIONS.issues); const issue = await issues.findOne({ issueId }); if (issue === null) throw new Error('Import issue does not exist.'); transitionAllowed(issue.resolutionStatus, next); const safeDisposition = validateDisposition(disposition); const updated: ImportIssueRecord = { ...issue, resolutionStatus: next, disposition: safeDisposition }; await issues.updateOne({ issueId }, { $set: { resolutionStatus: next, disposition: safeDisposition } }); await this.db.collection<ImportAuditEventRecord>(IMPORT_STAGING_COLLECTIONS.auditEvents).insertOne(eventForTransition(issue, next, safeDisposition, new Date())); return updated; }
  async inspect(batchId: string): Promise<ImportBatchInspection> { const batch = await this.db.collection<ImportBatchRecord>(IMPORT_STAGING_COLLECTIONS.batches).findOne({ batchId }); if (batch === null) throw new Error('Import batch does not exist.'); const [masters, transactions, issues] = await Promise.all([this.db.collection<ImportMasterProposalRecord>(IMPORT_STAGING_COLLECTIONS.masters).find({ batchId }).toArray(), this.db.collection<ImportTransactionProposalRecord>(IMPORT_STAGING_COLLECTIONS.transactions).find({ batchId }).toArray(), this.db.collection<ImportIssueRecord>(IMPORT_STAGING_COLLECTIONS.issues).find({ batchId }).toArray()]); return inspection(batch, masters, transactions, issues, 'unique_batch'); }
}

function inspection(batch: ImportBatchRecord, masters: readonly ImportMasterProposalRecord[], transactions: readonly ImportTransactionProposalRecord[], issues: readonly ImportIssueRecord[], idempotencyStatus: ImportBatchInspection['idempotencyStatus']): ImportBatchInspection { const proposalTypes = [...masters.map((record) => record.proposalType), ...transactions.map(() => 'transaction')]; return { batchId: batch.batchId, status: batch.status, proposalCounts: counts(proposalTypes), issueCountsByCode: counts(issues.map((issue) => issue.code)), issueCountsBySeverity: counts(issues.map((issue) => issue.severity)), unresolvedIssueCount: issues.filter((issue) => issue.resolutionStatus === 'open' || issue.resolutionStatus === 'acknowledged').length, planHashPrefix: batch.planHash.slice(0, 12), provenanceComplete: [batch.sanitizedCounts.provenance, ...masters.map((record) => record.provenance), ...transactions.map((record) => record.provenance), ...issues.map((record) => record.provenance)].every(isCompleteProvenance), idempotencyStatus }; }
