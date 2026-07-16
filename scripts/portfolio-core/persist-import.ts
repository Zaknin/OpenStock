#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Node type stripping requires the explicit TypeScript extension.
import { buildImportPlan, type FixturePack } from '../../lib/portfolio-core/import-planner.ts';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Node type stripping requires the explicit TypeScript extension.
import { MongoImportStagingRepository } from '../../lib/portfolio-core/import-staging.server.ts';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Node type stripping requires the explicit TypeScript extension.
import { sanitizedPersistOutput } from '../../lib/portfolio-core/import-staging-cli.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtureRoot = path.resolve(repoRoot, '.local', 'portfolio-core-fixtures');
type Args = Readonly<{ fixturePath: string; strict: boolean; mode: 'dry-run' | 'persist' }>;
function within(candidate: string, root: string): boolean { return candidate === root || candidate.startsWith(`${root}${path.sep}`); }
function usage(): never { console.error('Usage: node scripts/portfolio-core/persist-import.ts --fixture <private-pack> [--dry-run|--persist] [--strict|--non-strict]'); process.exit(2); }
function args(argv: readonly string[]): Args { let fixturePath: string | null = null; let strict = true; let mode: Args['mode'] = 'dry-run'; for (let index = 0; index < argv.length; index += 1) { const argument = argv[index]; if (argument === '--fixture') fixturePath = argv[++index] ?? null; else if (argument === '--dry-run') mode = 'dry-run'; else if (argument === '--persist') mode = 'persist'; else if (argument === '--strict') strict = true; else if (argument === '--non-strict') strict = false; else usage(); } if (fixturePath === null) usage(); const resolved = path.resolve(fixturePath); if (!within(resolved, fixtureRoot)) usage(); return { fixturePath: resolved, strict, mode }; }
async function json(pathname: string): Promise<Record<string, unknown>> { return JSON.parse(await readFile(pathname, 'utf8')) as Record<string, unknown>; }
async function main(): Promise<void> { const input = args(process.argv.slice(2)); let plan; try { const fixture: FixturePack = { manifest: await json(path.join(input.fixturePath, 'manifest.json')), setup: await json(path.join(input.fixturePath, 'setup.json')), tradeLog: await json(path.join(input.fixturePath, 'trade-log.json')) }; plan = buildImportPlan(fixture, { strict: input.strict }); } catch { console.error('portfolio-core staging: malformed fixture'); process.exitCode = 2; return; } if (input.mode === 'dry-run') { const result = { batchId: plan.manifest.id, planHash: plan.manifest.planHash, idempotent: false, status: plan.summary.exceptionCount > 0 ? 'completed_with_blocking_issues' as const : 'completed' as const, transactionMode: 'existing' as const }; console.log(sanitizedPersistOutput(plan, result, 'dry-run')); process.exitCode = plan.summary.exceptionCount > 0 ? 4 : 0; return; } const uri = process.env.PORTFOLIO_CORE_MONGODB_URI; if (!uri) { console.error('portfolio-core staging: persistence configuration unavailable'); process.exitCode = 3; return; } const client = new MongoClient(uri); try { await client.connect(); const result = await new MongoImportStagingRepository(client.db(), client).persist(plan); console.log(sanitizedPersistOutput(plan, result, 'persist')); process.exitCode = plan.summary.exceptionCount > 0 ? 4 : 0; } catch { console.error('portfolio-core staging: persistence failure'); process.exitCode = 3; } finally { await client.close(); } }
main().catch(() => { console.error('portfolio-core staging: internal failure'); process.exitCode = 1; });
