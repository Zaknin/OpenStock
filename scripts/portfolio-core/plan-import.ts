#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error Node type stripping requires the explicit TypeScript extension.
import { buildImportPlan, type FixturePack, type ImportPlan } from '../../lib/portfolio-core/import-planner.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const allowedFixtureRoot = path.resolve(repoRoot, '.local', 'portfolio-core-fixtures');
const allowedOutputRoot = path.resolve(repoRoot, '.local', 'portfolio-core-import-plans');
type ParsedArgs = Readonly<{ fixturePath: string; outputPath: string; strict: boolean }>;

function usage(): never { console.error('Usage: node scripts/portfolio-core/plan-import.ts --fixture <private-pack> [--output <ignored-dir>] [--strict|--non-strict]'); process.exit(2); }
function within(candidate: string, root: string): boolean { return candidate === root || candidate.startsWith(`${root}${path.sep}`); }
function parseArgs(argv: readonly string[]): ParsedArgs {
  let fixturePath: string | null = null; let outputPath: string | null = null; let strict = true;
  for (let index = 0; index < argv.length; index += 1) { const argument = argv[index]; if (argument === '--fixture') fixturePath = argv[++index] ?? null; else if (argument === '--output') outputPath = argv[++index] ?? null; else if (argument === '--strict') strict = true; else if (argument === '--non-strict') strict = false; else usage(); }
  if (fixturePath === null) usage(); const resolvedFixture = path.resolve(fixturePath); const output = path.resolve(outputPath ?? path.join(allowedOutputRoot, path.basename(fixturePath))); if (!within(resolvedFixture, allowedFixtureRoot) || !within(output, allowedOutputRoot)) usage(); return { fixturePath: resolvedFixture, outputPath: output, strict };
}
async function json(pathname: string): Promise<Record<string, unknown>> { return JSON.parse(await readFile(pathname, 'utf8')) as Record<string, unknown>; }
function sanitized(plan: ImportPlan): Record<string, unknown> { return { schema: 'portfolio-core-import-plan-summary-v1', planner_version: plan.manifest.plannerVersion, source_workbook_hash: plan.manifest.sourceWorkbookHash, mode: plan.manifest.mode, master_count: plan.summary.masterCount, transaction_count: plan.summary.transactionCount, valid_transaction_count: plan.summary.validTransactionCount, exception_count: plan.summary.exceptionCount, warning_count: plan.summary.warningCount, exception_code_counts: plan.summary.exceptionCodeCounts, warning_code_counts: plan.summary.warningCodeCounts, plan_hash: plan.summary.planHash }; }
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2)); const fixture: FixturePack = { manifest: await json(path.join(args.fixturePath, 'manifest.json')), setup: await json(path.join(args.fixturePath, 'setup.json')), tradeLog: await json(path.join(args.fixturePath, 'trade-log.json')) };
  const plan = buildImportPlan(fixture, { strict: args.strict }); await mkdir(args.outputPath, { recursive: true });
  await Promise.all([writeFile(path.join(args.outputPath, 'summary.json'), `${JSON.stringify(sanitized(plan), null, 2)}\n`), writeFile(path.join(args.outputPath, 'manifest.json'), `${JSON.stringify(plan.manifest, null, 2)}\n`), writeFile(path.join(args.outputPath, 'masters.json'), `${JSON.stringify({ portfolio: plan.portfolio, currencies: plan.currencies, accounts: plan.accounts, categories: plan.categories, instruments: plan.instruments, aliases: plan.aliases }, null, 2)}\n`), writeFile(path.join(args.outputPath, 'transactions.json'), `${JSON.stringify({ rawTransactions: plan.rawTransactions, transactions: plan.transactions }, null, 2)}\n`), writeFile(path.join(args.outputPath, 'exceptions.json'), `${JSON.stringify(plan.exceptions, null, 2)}\n`), writeFile(path.join(args.outputPath, 'warnings.json'), `${JSON.stringify(plan.warnings, null, 2)}\n`)]);
  const prefix = plan.summary.planHash.slice(0, 12); console.log(`portfolio-core import plan: masters=${plan.summary.masterCount} transactions=${plan.summary.transactionCount} valid=${plan.summary.validTransactionCount} exceptions=${plan.summary.exceptionCount} warnings=${plan.summary.warningCount} hash=${prefix} mode=${plan.manifest.mode}`); if (plan.summary.exceptionCount > 0) process.exitCode = 4;
}
main().catch(() => { console.error('portfolio-core import plan: internal failure'); process.exitCode = 1; });
