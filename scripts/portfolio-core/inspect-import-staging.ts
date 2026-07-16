#!/usr/bin/env node
import { MongoClient } from 'mongodb';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Node type stripping requires the explicit TypeScript extension.
import { MongoImportStagingRepository } from '../../lib/portfolio-core/import-staging.server.ts';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Node type stripping requires the explicit TypeScript extension.
import { sanitizedInspectionOutput } from '../../lib/portfolio-core/import-staging-cli.ts';

function usage(): never { console.error('Usage: node scripts/portfolio-core/inspect-import-staging.ts --batch <batch-id>'); process.exit(2); }
function batchId(argv: readonly string[]): string { if (argv.length !== 2 || argv[0] !== '--batch' || !/^[A-Za-z0-9_-]{1,128}$/.test(argv[1])) usage(); return argv[1]; }
async function main(): Promise<void> { const id = batchId(process.argv.slice(2)); const uri = process.env.PORTFOLIO_CORE_MONGODB_URI; if (!uri) { console.error('portfolio-core staging: persistence configuration unavailable'); process.exitCode = 3; return; } const client = new MongoClient(uri); try { await client.connect(); const inspection = await new MongoImportStagingRepository(client.db(), client).inspect(id); console.log(sanitizedInspectionOutput(inspection)); } catch { console.error('portfolio-core staging: inspection failure'); process.exitCode = 3; } finally { await client.close(); } }
main().catch(() => { console.error('portfolio-core staging: internal failure'); process.exitCode = 1; });
