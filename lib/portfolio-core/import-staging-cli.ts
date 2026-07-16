import type { ImportPlan } from './import-planner';
import type { ImportBatchInspection, PersistImportPlanResult } from './import-staging.server';

export function sanitizedPersistOutput(plan: ImportPlan, result: PersistImportPlanResult, mode: 'dry-run' | 'persist'): string {
  return JSON.stringify({ mode, batch_id_prefix: result.batchId.slice(0, 16), plan_hash_prefix: result.planHash.slice(0, 12), idempotent: result.idempotent, transaction_mode: result.transactionMode, status: result.status, master_proposal_count: plan.summary.masterCount, transaction_proposal_count: plan.summary.transactionCount, issue_counts_by_code: plan.summary.exceptionCodeCounts, warning_counts_by_code: plan.summary.warningCodeCounts }, null, 2);
}

export function sanitizedInspectionOutput(inspection: ImportBatchInspection): string {
  return JSON.stringify({ batch_id_prefix: inspection.batchId.slice(0, 16), status: inspection.status, proposal_counts: inspection.proposalCounts, issue_counts_by_code: inspection.issueCountsByCode, issue_counts_by_severity: inspection.issueCountsBySeverity, unresolved_issue_count: inspection.unresolvedIssueCount, plan_hash_prefix: inspection.planHashPrefix, provenance_complete: inspection.provenanceComplete, idempotency_status: inspection.idempotencyStatus }, null, 2);
}
