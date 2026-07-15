# SOXL local AI primary/fallback routing

This kit adds a SOXL-specific OpenAI-compatible router:

1. Health-check the RTX 4090 / Ornith endpoint with a 3-second budget.
2. Use Ornith when the configured model is present.
3. Use Fin-R1 immediately when the primary is unavailable.
4. Keep the primary circuit open for 60 seconds after a failure, avoiding a repeated 3-second delay on every request.
5. Retry with Fin-R1 when the primary request fails or its output fails the existing production SOXL validator.
6. Use native Node HTTP/HTTPS transport, avoiding Undici's approximately 300-second headers timeout.
7. Send a strict provider-compatible JSON Schema that enforces the response shape and basic field types.
8. Send `chat_template_kwargs.enable_thinking=false` only to Ornith; Fin-R1 receives the same strict schema without that Ornith-specific option.
9. Build a compact formatter payload with deterministic, section-specific evidence allowlists: summary uses at most one reference; supporting and conflicting points use at most four; missing-evidence points use one canonical missing marker; risk and limitation points use at most two. The full evidence catalog stays server-side for canonical mapping, exact missing-evidence coverage, grounding, and response-contract validation.

The 3-second limit applies only to the primary readiness check. It does not abort a valid analysis that takes longer than three seconds.

The circuit state is intentionally process-local. It prevents repeated primary probes within one server process, but it is not shared across multiple application instances and is reset by a process restart.

This kit changes provider routing only. It does not yet replace the existing explanation prompt with the planned plain-language price/support/resistance/rejection output.

## Files

Copy these files into the same paths under `C:\Dev\OpenStock`:

- `lib/soxl-intelligence/ai/soxl-ai-local-provider-router.server.ts` — new
- `lib/soxl-intelligence/ai/soxl-ai-explanation-service.server.ts` — replacement
- `lib/soxl-intelligence/ai/soxl-ai-local-provider-router.server.test.ts` — new
- `lib/soxl-intelligence/ai/soxl-ai-explanation-failover.server.test.ts` — new

The existing `soxl-ai-explanation-service.server.test.ts` is not replaced.

## Windows test command

```powershell
Clear-Host

Set-Location C:\Dev\OpenStock

npx.cmd vitest run `
    lib\soxl-intelligence\ai\soxl-ai-local-provider-router.server.test.ts `
    lib\soxl-intelligence\ai\soxl-ai-explanation-failover.server.test.ts `
    lib\soxl-intelligence\ai\soxl-ai-explanation-service.server.test.ts `
    --reporter=verbose
```

Expected: 3 test files pass and 34 tests pass, based on the supplied source snapshot.

## Required Linux `.env` configuration

Add these values manually to the existing Linux `.env`. Replace `<ORNITH_PORT>` and `<EXACT_MODEL_ID>` with the values returned by the 4090 model server's `/v1/models` endpoint.

```dotenv
SOXL_AI_LOCAL_ROUTING_ENABLED=true

SOXL_AI_PRIMARY_BASE_URL=http://192.168.23.99:<ORNITH_PORT>/v1
SOXL_AI_PRIMARY_MODEL=<EXACT_MODEL_ID>
SOXL_AI_PRIMARY_PROVIDER_ID=ornith-35b-primary
SOXL_AI_PRIMARY_HEALTH_PATH=/models
SOXL_AI_PRIMARY_HEALTH_TIMEOUT_MS=3000
SOXL_AI_PRIMARY_REQUEST_TIMEOUT_MS=600000

SOXL_AI_FALLBACK_BASE_URL=http://192.168.23.130:8083/v1
SOXL_AI_FALLBACK_MODEL=fin-r1-q4km
SOXL_AI_FALLBACK_PROVIDER_ID=fin-r1-fallback
SOXL_AI_FALLBACK_REQUEST_TIMEOUT_MS=1200000

SOXL_AI_PRIMARY_CIRCUIT_OPEN_MS=60000
SOXL_AI_MAX_TOKENS=2048
SOXL_AI_FALLBACK_MAX_TOKENS=1024
SOXL_AI_FALLBACK_MAX_REQUEST_BYTES=96000
SOXL_AI_CACHE_PROMPT=false
```

Both API-key variables are optional for local servers. Set them only when the server requires bearer authentication:

```dotenv
SOXL_AI_PRIMARY_API_KEY=
SOXL_AI_FALLBACK_API_KEY=
```

## Verify network access from the OpenStock VM

The OpenStock server—not the Windows development shell—must be able to reach both model endpoints.

Primary check:

```bash
clear
curl -sS --max-time 3 \
  http://192.168.23.99:<ORNITH_PORT>/v1/models \
  | python3 -m json.tool
```

Fallback check:

```bash
clear
curl -sS --max-time 10 \
  http://192.168.23.130:8083/v1/models \
  | python3 -m json.tool
```

`SOXL_AI_PRIMARY_MODEL` must exactly match one `data[].id` value returned by the primary endpoint. The fallback should report `fin-r1-q4km` with context 32768.

## Runtime behavior

Primary success:

```text
SOXL_AI_ROUTE provider=ornith-35b-primary role=primary fallbackUsed=false reason=none
```

Primary health timeout, followed by fallback success:

```text
SOXL_AI_ROUTE provider=fin-r1-fallback role=fallback fallbackUsed=true reason=primary_health_timeout
```

Primary output rejected by the production validator, followed by fallback success:

```text
SOXL_AI_RESPONSE_REJECTED provider=ornith-35b-primary reason=<fixed-validator-reason>
SOXL_AI_ROUTE provider=fin-r1-fallback role=fallback fallbackUsed=true reason=primary_validation_rejected
```

The implementation does not log raw prompts, model output, API keys, provider URLs, or HTTP response bodies. It records only request-size metadata (prompt and schema character counts, evidence count, token cap, and HTTP body bytes) and validator reason/section/field metadata. Reference-count rejections also log observed and unique counts, the section maximum, and the hard validator maximum, so duplicates can be distinguished from broad citation. Fin-R1 advertises a 32768-token default context through `/props`; the fallback keeps a 1024-token output cap and rejects requests over the explicit 96000-byte local budget before sending them.
The provider schema intentionally omits dynamic alias enums and semantic constraints. The formatter payload omits competing assessment definitions, supplies the application-selected current evidence-state outcome only, and carries sectionEvidenceRefs plus sectionEvidenceRefMaximums for the model. The server-side SOXL validator remains the authority for exact keys, section allowlists, evidence aliases, missing-evidence coverage, numeric grounding, and all trading-safety rules, including rejection of forbidden scenario selection.

## Deployment flow

After Windows tests pass:

1. Commit and push from `C:\Dev\OpenStock`.
2. On the OpenStock Linux VM, pull with `git pull --ff-only`.
3. Rebuild the `openstock` service with the existing Docker Compose workflow.
4. Trigger one SOXL explanation while the 4090 endpoint is online.
5. Turn off or stop the 4090 model endpoint and trigger another explanation. The first offline request should wait no more than approximately three seconds before selecting Fin-R1; later requests within the circuit interval should go directly to Fin-R1.

## Validation performed for this kit

- Targeted TypeScript compilation passed for the router, explanation service, prompt, evidence catalog, and validator dependency graph.
- Router, failover, and existing explanation-service tests: 34/34 passed.
- Wider AI test run: 263 tests passed; two unrelated source-inspection tests could not run because the uploaded source bundle did not include the referenced React component and page files.
