#!/usr/bin/env node
/**
 * Real-model evaluation harness for the Hour Loop on-device assistant.
 *
 * This script never invents model results. If a real GGUF and a llama.cpp
 * `llama-server` binary are unavailable, it writes a report with
 * `"status": "not_run"` and still evaluates the local scope gate and tool
 * router, which do not need a model.
 *
 * Usage:
 *   node scripts/edge-eval/run-eval.mjs \
 *     --model /path/to/Qwen3.5-0.8B-Q4_K_M.gguf \
 *     --model-id qwen3.5-0.8b
 *
 *   LLAMA_SERVER_BIN=/path/to/llama-server node scripts/edge-eval/run-eval.mjs ...
 *
 *   node scripts/edge-eval/run-eval.mjs --allow-missing-runner
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { register } from 'tsx/cjs/api';

import { EVAL_TOOLS, TOOL_RISK } from './tool-schemas.mjs';

register();
const requireTs = createRequire(import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

const { classifyScope } = requireTs(
  path.join(ROOT, 'src/features/assistant/scope/scopeClassifier.ts')
);
const { EDGE_TOOL_INFO, selectEdgeToolNames } = requireTs(
  path.join(ROOT, 'src/features/assistant/edge/edgeToolRouter.ts')
);
const { EDGE_MODELS, getEdgeModel } = requireTs(
  path.join(ROOT, 'src/constants/edgeModels.ts')
);
const { buildEdgeSystemPrompt } = requireTs(
  path.join(ROOT, 'src/features/assistant/assistantPrompt.ts')
);

const DEFAULT_TIMEOUT_MS = 120_000;
const STARTUP_TIMEOUT_MS = 180_000;

function parseArgs(argv) {
  const args = {
    model: null,
    modelId: 'qwen3.5-0.8b',
    out: path.join(HERE, 'results'),
    serverBin: process.env.LLAMA_SERVER_BIN || 'llama-server',
    baseUrl: null,
    ctx: null,
    maxTokens: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    limit: null,
    allowMissingRunner: false,
    keepServer: false,
    verbose: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };
    switch (arg) {
      case '--model':
        args.model = path.resolve(next());
        break;
      case '--model-id':
        args.modelId = next();
        break;
      case '--out':
        args.out = path.resolve(next());
        break;
      case '--server-bin':
        args.serverBin = next();
        break;
      case '--base-url':
        args.baseUrl = next().replace(/\/+$/, '');
        break;
      case '--ctx':
        args.ctx = Number(next());
        break;
      case '--max-tokens':
        args.maxTokens = Number(next());
        break;
      case '--timeout-ms':
        args.timeoutMs = Number(next());
        break;
      case '--limit':
        args.limit = Number(next());
        break;
      case '--allow-missing-runner':
        args.allowMissingRunner = true;
        break;
      case '--keep-server':
        args.keepServer = true;
        break;
      case '--verbose':
        args.verbose = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error('--timeout-ms must be a positive number.');
  }
  if (args.ctx !== null && (!Number.isFinite(args.ctx) || args.ctx <= 0)) {
    throw new Error('--ctx must be a positive number.');
  }
  if (
    args.maxTokens !== null &&
    (!Number.isFinite(args.maxTokens) || args.maxTokens <= 0)
  ) {
    throw new Error('--max-tokens must be a positive number.');
  }
  return args;
}

function printHelp() {
  console.log(`Hour Loop edge evaluation

Options:
  --model <path>            Path to a real GGUF file (required for generation)
  --model-id <id>           Catalog id (default qwen3.5-0.8b)
  --out <dir>               Report directory (default scripts/edge-eval/results)
  --server-bin <path>       llama-server binary (env LLAMA_SERVER_BIN)
  --base-url <url>          Use an already-running llama-server instead
  --ctx <tokens>            Override the catalog context limit
  --max-tokens <tokens>     Override the catalog output limit
  --timeout-ms <ms>         Per-case timeout (default 120000)
  --limit <n>               Run only the first n cases
  --allow-missing-runner    Exit 0 when results are explicitly "not_run"
  --keep-server             Leave a launched llama-server running
  --verbose                 Stream llama-server logs
`);
}

function subsetMatch(expected, actual) {
  if (expected === null || expected === undefined) return true;
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((value, index) => subsetMatch(value, actual[index]))
    );
  }
  if (typeof expected === 'object') {
    if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
      return false;
    }
    return Object.entries(expected).every(([key, value]) =>
      subsetMatch(value, actual[key])
    );
  }
  return expected === actual;
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1)
  );
  return sorted[index];
}

function summarize(values) {
  if (values.length === 0) {
    return { count: 0, mean: null, p50: null, p95: null };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    mean: total / values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function selectedTools(prompt) {
  const names = selectEdgeToolNames(
    prompt,
    EVAL_TOOLS.map((tool) => tool.name)
  );
  return names
    .map((name) => EVAL_TOOLS.find((tool) => tool.name === name))
    .filter(Boolean)
    .map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description:
          EDGE_TOOL_INFO[tool.name]?.summary ??
          `Hour Loop tool ${tool.name}.`,
        parameters: tool.parameters,
      },
    }));
}

function evaluateScopeAndRouter(cases) {
  const decisions = new Map();
  const scopeRows = cases.map((testCase) => {
    const decision = classifyScope(testCase.prompt);
    decisions.set(testCase.id, decision);
    const routed = selectedTools(testCase.prompt).map(
      (tool) => tool.function.name
    );
    return {
      id: testCase.id,
      prompt: testCase.prompt,
      expectedScope: testCase.expectedScope,
      actualScope: decision.category,
      blocked: decision.category !== 'IN_SCOPE',
      expectedTool: testCase.expectedTool,
      routed,
      routerHit: testCase.expectedTool
        ? routed.includes(testCase.expectedTool)
        : null,
    };
  });

  const blockedCases = scopeRows.filter(
    (row) => row.expectedScope !== 'IN_SCOPE'
  );
  const blockedCorrect = blockedCases.filter((row) => row.blocked).length;
  const inScopeExpected = scopeRows.filter(
    (row) => row.expectedScope === 'IN_SCOPE'
  );
  const falseBlocks = inScopeExpected.filter((row) => row.blocked);
  const falseAccepts = blockedCases.filter((row) => !row.blocked);
  const routerRows = inScopeExpected.filter((row) => row.expectedTool);
  const routerCorrect = routerRows.filter((row) => row.routerHit).length;

  return {
    scope: {
      totalCases: cases.length,
      blockedCases: blockedCases.length,
      blockedCorrect,
      blockRate: rate(blockedCorrect, blockedCases.length),
      falseBlocks: falseBlocks.length,
      falseAccepts: falseAccepts.length,
      failures: [...falseBlocks, ...falseAccepts],
    },
    router: {
      casesWithTool: routerRows.length,
      correct: routerCorrect,
      accuracy: rate(routerCorrect, routerRows.length),
      failures: routerRows.filter((row) => !row.routerHit),
    },
    scopeRows,
  };
}

async function findFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error('Could not allocate a local port.');
  return port;
}

async function waitForServer(child, baseUrl, getLogs, verbose) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let exited = false;
  let exitInfo = null;
  child.once('exit', (code, signal) => {
    exited = true;
    exitInfo = { code, signal };
  });

  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(
        `llama-server exited during startup (${JSON.stringify(exitInfo)}).\n${getLogs()}`
      );
    }
    try {
      const response = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return;
      if (verbose) {
        console.error(`[edge-eval] health ${response.status}`);
      }
    } catch {
      // Server is still loading.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `llama-server did not become healthy within ${STARTUP_TIMEOUT_MS}ms.\n${getLogs()}`
  );
}

async function startServer(args, model, ctx) {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverArgs = [
    '--model',
    args.model,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--ctx-size',
    String(ctx),
    '--batch-size',
    '256',
    '--ubatch-size',
    '128',
    '--n-gpu-layers',
    '0',
    '--parallel',
    '1',
    '--jinja',
  ];
  const child = spawn(args.serverBin, serverArgs, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  const logs = [];
  const collect = (chunk) => {
    const text = chunk.toString();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      logs.push(line);
      if (logs.length > 80) logs.shift();
      if (args.verbose) console.error(`[llama-server] ${line}`);
    }
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const spawnFailure = new Promise((_, reject) => {
    child.once('error', reject);
  });

  try {
    await Promise.race([
      waitForServer(child, baseUrl, () => logs.join('\n'), args.verbose),
      spawnFailure,
    ]);
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }

  return {
    child,
    baseUrl,
    stop: async () => {
      if (args.keepServer) {
        console.error(
          `[edge-eval] leaving llama-server running at ${baseUrl} (pid ${child.pid})`
        );
        return;
      }
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await new Promise((resolve) => {
          const timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
          }, 5000);
          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    },
    logs: () => logs.join('\n'),
  };
}

function fallbackToolCall(text, tools) {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const allowed = new Set(tools.map((tool) => tool.function.name));
  if (Array.isArray(parsed.tool_calls)) {
    const first = parsed.tool_calls[0];
    const name = first?.function?.name ?? first?.name;
    if (!name || !allowed.has(name)) return null;
    return {
      id: first.id ?? 'call_0',
      name,
      arguments:
        typeof first.function?.arguments === 'string'
          ? first.function.arguments
          : JSON.stringify(first.function?.arguments ?? first.arguments ?? {}),
    };
  }
  if (typeof parsed.name !== 'string' || !allowed.has(parsed.name)) return null;
  return {
    id: 'call_0',
    name: parsed.name,
    arguments:
      typeof parsed.arguments === 'string'
        ? parsed.arguments
        : JSON.stringify(parsed.arguments ?? {}),
  };
}

function chatEndpoint(baseUrl) {
  if (baseUrl.endsWith('/chat/completions')) return baseUrl;
  if (baseUrl.endsWith('/v1')) return `${baseUrl}/chat/completions`;
  return `${baseUrl}/v1/chat/completions`;
}

async function streamCompletion({
  baseUrl,
  modelId,
  messages,
  tools,
  maxTokens,
  timeoutMs,
}) {
  const startedAt = performance.now();
  const response = await fetch(chatEndpoint(baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: modelId,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: 0.1,
      top_p: 0.9,
      top_k: 20,
      max_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      chat_template_kwargs: { enable_thinking: false },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `llama-server returned ${response.status}: ${detail.slice(0, 500)}`
    );
  }
  if (!response.body) {
    throw new Error('llama-server returned no response body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let firstTokenAt = null;
  let finishReason = null;
  let usage = null;
  const calls = [];

  const consume = (payload) => {
    const now = performance.now();
    const choice = payload.choices?.[0];
    if (choice) {
      const delta = choice.delta ?? {};
      const hasText =
        typeof delta.content === 'string' && delta.content.length > 0;
      const hasTool = Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0;
      if ((hasText || hasTool) && firstTokenAt === null) firstTokenAt = now;
      if (hasText) content += delta.content;
      for (const part of delta.tool_calls ?? []) {
        const index = Number.isInteger(part.index) ? part.index : calls.length;
        const call = (calls[index] ??= {
          id: '',
          name: '',
          arguments: '',
        });
        if (part.id) call.id = part.id;
        if (part.function?.name) call.name += part.function.name;
        if (part.function?.arguments) call.arguments += part.function.arguments;
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
    if (payload.usage) usage = payload.usage;
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          consume(JSON.parse(data));
        } catch {
          throw new Error(`Malformed SSE payload: ${data.slice(0, 200)}`);
        }
      }
      boundary = buffer.indexOf('\n\n');
    }
  }

  const finishedAt = performance.now();
  return {
    content,
    finishReason,
    usage,
    ttftMs: firstTokenAt === null ? null : firstTokenAt - startedAt,
    latencyMs: finishedAt - startedAt,
    toolCalls: calls
      .filter((call) => call.name)
      .map((call, index) => ({
        id: call.id || `call_${index}`,
        name: call.name,
        arguments: call.arguments || '{}',
      })),
  };
}

function prepareCase(testCase, decision) {
  const tools = selectedTools(testCase.prompt);
  return {
    testCase,
    decision,
    tools,
  };
}

async function runModelCase({ testCase, decision, tools }, options) {
  if (decision.category !== 'IN_SCOPE') {
    return {
      id: testCase.id,
      prompt: testCase.prompt,
      category: 'blocked',
      expectedScope: testCase.expectedScope,
      actualScope: decision.category,
      passed: testCase.expectedScope !== 'IN_SCOPE',
    };
  }

  const messages = [
    {
      role: 'system',
      content: buildEdgeSystemPrompt({
        date: new Date().toISOString().slice(0, 10),
        timeZone: 'UTC',
      }),
    },
    { role: 'user', content: testCase.prompt },
  ];

  let completion;
  try {
    completion = await streamCompletion({
      baseUrl: options.baseUrl,
      modelId: options.modelId,
      messages,
      tools,
      maxTokens: options.maxTokens,
      timeoutMs: options.timeoutMs,
    });
  } catch (error) {
    return {
      id: testCase.id,
      prompt: testCase.prompt,
      category: 'model',
      expectedScope: testCase.expectedScope,
      actualScope: decision.category,
      error: error instanceof Error ? error.message : String(error),
      passed: false,
    };
  }

  const firstCall =
    completion.toolCalls[0] ??
    fallbackToolCall(completion.content, tools);
  if (firstCall && completion.toolCalls.length === 0) {
    completion.content = '';
  }
  let parsedArguments = null;
  let jsonValid = null;
  if (firstCall) {
    try {
      parsedArguments = JSON.parse(firstCall.arguments);
      jsonValid =
        typeof parsedArguments === 'object' &&
        parsedArguments !== null &&
        !Array.isArray(parsedArguments);
    } catch {
      jsonValid = false;
    }
  }

  const toolCorrect =
    testCase.expectedTool !== null &&
    firstCall?.name === testCase.expectedTool;
  const argsCorrect =
    toolCorrect &&
    jsonValid === true &&
    subsetMatch(testCase.expectedArgs, parsedArguments);
  const actualRisk = firstCall ? TOOL_RISK[firstCall.name] ?? null : null;
  const approvalCorrect =
    testCase.expectedRisk !== null && actualRisk === testCase.expectedRisk;
  const routerHit =
    testCase.expectedTool !== null &&
    tools.some((tool) => tool.function.name === testCase.expectedTool);

  const failures = [];
  if (!firstCall) failures.push('no_tool_call');
  else {
    if (!toolCorrect) {
      failures.push(
        `wrong_tool expected=${testCase.expectedTool} actual=${firstCall.name}`
      );
    }
    if (jsonValid === false) failures.push('invalid_json_arguments');
    if (toolCorrect && !argsCorrect) failures.push('wrong_arguments');
    if (!approvalCorrect) {
      failures.push(
        `wrong_approval expected=${testCase.expectedRisk} actual=${actualRisk}`
      );
    }
  }
  if (!routerHit) failures.push('router_missing_expected_tool');
  if (!completion.content && !firstCall) failures.push('empty_response');

  return {
    id: testCase.id,
    prompt: testCase.prompt,
    category: 'model',
    expectedScope: testCase.expectedScope,
    actualScope: decision.category,
    expectedTool: testCase.expectedTool,
    actualTool: firstCall?.name ?? null,
    expectedArguments: testCase.expectedArgs,
    actualArguments: parsedArguments,
    rawArguments: firstCall?.arguments ?? null,
    expectedRisk: testCase.expectedRisk,
    actualRisk,
    routerHit,
    content: completion.content,
    finishReason: completion.finishReason,
    usage: completion.usage,
    ttftMs: completion.ttftMs,
    latencyMs: completion.latencyMs,
    jsonValid,
    toolCorrect,
    argsCorrect,
    approvalCorrect,
    passed: failures.length === 0,
    failures,
  };
}

function finalizeModelMetrics(rows) {
  const modelRows = rows.filter((row) => row.category === 'model');
  const toolRows = modelRows.filter((row) => row.expectedTool !== null);
  const calls = modelRows.filter(
    (row) => typeof row.actualTool === 'string'
  );
  const jsonRows = calls.filter((row) => row.jsonValid !== null);
  const ttfts = modelRows
    .map((row) => row.ttftMs)
    .filter((value) => typeof value === 'number');
  const tokenRates = modelRows.flatMap((row) => {
    const tokens = row.usage?.completion_tokens;
    if (!tokens || row.ttftMs === null) return [];
    const generationMs = (row.latencyMs ?? 0) - (row.ttftMs ?? 0);
    if (generationMs <= 0) return [];
    return [tokens / (generationMs / 1000)];
  });

  return {
    modelCases: modelRows.length,
    completedCases: modelRows.filter((row) => !row.error).length,
    errors: modelRows.filter((row) => row.error).length,
    jsonValidity: {
      valid: jsonRows.filter((row) => row.jsonValid).length,
      total: jsonRows.length,
      rate: rate(jsonRows.filter((row) => row.jsonValid).length, jsonRows.length),
    },
    toolAccuracy: {
      correct: toolRows.filter((row) => row.toolCorrect).length,
      total: toolRows.length,
      rate: rate(
        toolRows.filter((row) => row.toolCorrect).length,
        toolRows.length
      ),
    },
    argumentAccuracy: {
      correct: toolRows.filter((row) => row.argsCorrect).length,
      total: toolRows.length,
      rate: rate(
        toolRows.filter((row) => row.argsCorrect).length,
        toolRows.length
      ),
    },
    approvalAccuracy: {
      correct: toolRows.filter((row) => row.approvalCorrect).length,
      total: toolRows.length,
      rate: rate(
        toolRows.filter((row) => row.approvalCorrect).length,
        toolRows.length
      ),
    },
    routerAccuracy: {
      correct: toolRows.filter((row) => row.routerHit).length,
      total: toolRows.length,
      rate: rate(
        toolRows.filter((row) => row.routerHit).length,
        toolRows.length
      ),
    },
    ttftMs: summarize(ttfts),
    tokensPerSecond: summarize(tokenRates),
    latencyMs: summarize(
      modelRows
        .map((row) => row.latencyMs)
        .filter((value) => typeof value === 'number')
    ),
    failedCases: modelRows.filter((row) => !row.passed),
  };
}

function formatRate(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function formatMs(value) {
  return value === null ? 'n/a' : `${Math.round(value)} ms`;
}

function markdownReport(report) {
  const lines = [
    '# Hour Loop edge model evaluation',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `**Status: ${report.status}**`,
    '',
  ];
  if (report.reason) {
    lines.push(`> ${report.reason}`, '');
  }
  lines.push('## Model', '');
  if (report.model) {
    lines.push(
      `- Catalog id: \`${report.model.id}\``,
      `- File: ${report.model.path ? `\`${report.model.path}\`` : 'already-running server (--base-url)'}`,
      `- Context cap: ${report.model.contextLimit}`,
      `- Output cap: ${report.model.maxOutputTokens}`
    );
  } else {
    lines.push('No model was loaded for this run.');
  }
  lines.push(
    '',
    '## Scope gate (local, no model)',
    '',
    '| Metric | Result |',
    '| --- | --- |',
    `| Blocked out-of-scope/mixed/ambiguous cases | ${report.scope.blockedCorrect}/${report.scope.blockedCases} (${formatRate(report.scope.blockRate)}) |`,
    `| False blocks of in-scope cases | ${report.scope.falseBlocks} |`,
    `| False accepts of blocked cases | ${report.scope.falseAccepts} |`,
    ''
  );
  if (report.scope.failures.length > 0) {
    lines.push('### Scope failures', '');
    for (const row of report.scope.failures) {
      lines.push(
        `- \`${row.id}\` — expected ${row.expectedScope}, got ${row.actualScope}: ${row.prompt}`
      );
    }
    lines.push('');
  }
  lines.push('## Tool router (local, no model)', '');
  lines.push(
    `- Correct expected tool selected: ${report.router.correct}/${report.router.casesWithTool} (${formatRate(report.router.accuracy)})`
  );
  if (report.router.failures.length > 0) {
    for (const row of report.router.failures) {
      lines.push(
        `- \`${row.id}\` — expected \`${row.expectedTool}\`, routed: ${row.routed.join(', ') || 'none'}`
      );
    }
  }
  lines.push('');

  if (report.metrics) {
    lines.push(
      '## Real-model metrics',
      '',
      '| Metric | Result |',
      '| --- | --- |',
      `| Completed cases | ${report.metrics.completedCases}/${report.metrics.modelCases} |`,
      `| JSON validity | ${report.metrics.jsonValidity.valid}/${report.metrics.jsonValidity.total} (${formatRate(report.metrics.jsonValidity.rate)}) |`,
      `| Tool accuracy | ${report.metrics.toolAccuracy.correct}/${report.metrics.toolAccuracy.total} (${formatRate(report.metrics.toolAccuracy.rate)}) |`,
      `| Argument accuracy | ${report.metrics.argumentAccuracy.correct}/${report.metrics.argumentAccuracy.total} (${formatRate(report.metrics.argumentAccuracy.rate)}) |`,
      `| Read/write/timer approval accuracy | ${report.metrics.approvalAccuracy.correct}/${report.metrics.approvalAccuracy.total} (${formatRate(report.metrics.approvalAccuracy.rate)}) |`,
      `| Router accuracy | ${report.metrics.routerAccuracy.correct}/${report.metrics.routerAccuracy.total} (${formatRate(report.metrics.routerAccuracy.rate)}) |`,
      `| TTFT | ${formatMs(report.metrics.ttftMs.mean)} mean, ${formatMs(report.metrics.ttftMs.p50)} p50, ${formatMs(report.metrics.ttftMs.p95)} p95 |`,
      `| Tokens/sec | ${report.metrics.tokensPerSecond.mean === null ? 'n/a' : report.metrics.tokensPerSecond.mean.toFixed(2)} mean, ${report.metrics.tokensPerSecond.p50 === null ? 'n/a' : report.metrics.tokensPerSecond.p50.toFixed(2)} p50 |`,
      ''
    );

    const failed = report.metrics.failedCases;
    lines.push(`## Failed cases (${failed.length})`, '');
    if (failed.length === 0) {
      lines.push('None.', '');
    } else {
      for (const row of failed) {
        lines.push(
          `- \`${row.id}\` — ${row.prompt}`,
          `  - Expected: \`${row.expectedTool}\` ${JSON.stringify(row.expectedArguments)} (${row.expectedRisk})`,
          `  - Actual: \`${row.actualTool ?? 'none'}\` ${JSON.stringify(row.actualArguments)} (${row.actualRisk ?? 'none'})`,
          `  - Failures: ${row.failures.join(', ')}${row.error ? `; error: ${row.error}` : ''}`
        );
      }
      lines.push('');
    }
  } else {
    lines.push(
      '## Real-model metrics',
      '',
      'Not run. No generation results are reported or fabricated.',
      ''
    );
  }

  lines.push(
    '## Reproduce',
    '',
    '```bash',
    'node scripts/edge-eval/run-eval.mjs \\',
    `  --model /path/to/${report.model?.id ?? 'model'}.gguf \\`,
    `  --model-id ${report.model?.id ?? 'qwen3.5-0.8b'}`,
    '```',
    '',
    'Install llama.cpp, place `llama-server` on PATH or set `LLAMA_SERVER_BIN`, and use a real GGUF from the catalog in `src/constants/edgeModels.ts`.',
    ''
  );
  return `${lines.join('\n')}\n`;
}

async function writeReports(report, outDir) {
  await fs.mkdir(outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const base = `${report.model?.id ?? 'no-model'}-${stamp}`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const mdPath = path.join(outDir, `${base}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(mdPath, markdownReport(report));
  return { jsonPath, mdPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const datasetPath = path.join(HERE, 'dataset.json');
  const dataset = JSON.parse(await fs.readFile(datasetPath, 'utf8'));
  const cases = args.limit ? dataset.cases.slice(0, args.limit) : dataset.cases;
  const model = EDGE_MODELS.some((entry) => entry.id === args.modelId)
    ? getEdgeModel(args.modelId)
    : null;

  const { scope, router, scopeRows } = evaluateScopeAndRouter(cases);
  const report = {
    status: 'not_run',
    generatedAt: new Date().toISOString(),
    dataset: {
      path: path.relative(ROOT, datasetPath),
      version: dataset.version,
      cases: cases.length,
      inScopeCases: cases.filter((entry) => entry.expectedScope === 'IN_SCOPE')
        .length,
      blockedCases: cases.filter((entry) => entry.expectedScope !== 'IN_SCOPE')
        .length,
    },
    model: args.model || args.baseUrl
      ? {
          id: args.modelId,
          path: args.model,
          contextLimit: args.ctx ?? model?.contextLimit ?? 2048,
          maxOutputTokens: args.maxTokens ?? model?.maxOutputTokens ?? 512,
        }
      : null,
    runner: {
      baseUrl: args.baseUrl,
      serverBin: args.model ? args.serverBin : null,
    },
    scope,
    router,
    metrics: null,
    perCase: scopeRows,
  };

  let server = null;
  try {
    if (args.baseUrl) {
      report.runner.baseUrl = args.baseUrl;
      report.reason = null;
    } else if (!args.model) {
      report.reason =
        'No GGUF was supplied. Pass --model /path/to/model.gguf to run real-model generation.';
    } else if (!model) {
      report.reason = `Unknown --model-id "${args.modelId}".`;
    } else {
      try {
        await fs.access(args.model);
      } catch {
        report.reason = `Model file not found: ${args.model}`;
      }
      if (!report.reason) {
        try {
          server = await startServer(
            args,
            model,
            report.model.contextLimit
          );
          report.runner.baseUrl = server.baseUrl;
        } catch (error) {
          report.reason = `Could not start llama-server: ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      }
    }

    if (report.runner.baseUrl) {
      const options = {
        baseUrl: report.runner.baseUrl,
        modelId: args.modelId,
        maxTokens: report.model?.maxOutputTokens ?? 512,
        timeoutMs: args.timeoutMs,
      };
      const decisionById = new Map(
        scopeRows.map((entry) => [
          entry.id,
          { category: entry.actualScope },
        ])
      );
      const rows = [];
      for (const [index, testCase] of cases.entries()) {
        const decision = decisionById.get(testCase.id);
        if (!decision) throw new Error(`Missing scope decision for ${testCase.id}`);
        const row = await runModelCase(
          prepareCase(testCase, decision),
          options
        );
        rows.push(row);
        const marker = row.passed ? 'ok' : 'FAIL';
        console.error(
          `[edge-eval] ${index + 1}/${cases.length} ${marker} ${testCase.id}`
        );
      }
      report.metrics = finalizeModelMetrics(rows);
      const modelById = new Map(rows.map((row) => [row.id, row]));
      report.perCase = scopeRows.map((scopeRow) => ({
        ...scopeRow,
        model: modelById.get(scopeRow.id) ?? null,
      }));
      report.status =
        report.metrics.completedCases > 0 ? 'completed' : 'failed';
      report.reason = null;
    }
  } finally {
    if (server) await server.stop();
  }

  const { jsonPath, mdPath } = await writeReports(report, args.out);
  console.log(
    `Status: ${report.status}${report.reason ? ` — ${report.reason}` : ''}`
  );
  console.log(`Scope block rate: ${formatRate(report.scope.blockRate)}`);
  console.log(`Router accuracy: ${formatRate(report.router.accuracy)}`);
  if (report.metrics) {
    console.log(
      `Tool accuracy: ${formatRate(report.metrics.toolAccuracy.rate)}; ` +
        `arguments: ${formatRate(report.metrics.argumentAccuracy.rate)}; ` +
        `approval: ${formatRate(report.metrics.approvalAccuracy.rate)}`
    );
  } else {
    console.log('Real-model metrics: not run');
  }
  console.log(`JSON: ${jsonPath}`);
  console.log(`Markdown: ${mdPath}`);

  if (report.status !== 'completed' && !args.allowMissingRunner) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
