import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULTS = Object.freeze({
  games: 128,
  workers: 7,
  outdir: path.join("Tests", "game_dump", "ab"),
  mode: "chaotic",
  maxTurns: 220,
  seed: 42,
  aiBudgetMs: 10000,
  traceMode: "light",
  baselineConfig: null,
  candidateConfig: null,
  clean: true,
});

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--clean") {
      options.clean = true;
      continue;
    }
    if (key === "--no-clean") {
      options.clean = false;
      continue;
    }
    if (!value) continue;
    if (key === "--games") { options.games = Math.max(1, Number.parseInt(value, 10) || options.games); i += 1; }
    else if (key === "--workers") { options.workers = Math.max(1, Number.parseInt(value, 10) || options.workers); i += 1; }
    else if (key === "--outdir") { options.outdir = value; i += 1; }
    else if (key === "--mode") { options.mode = value === "deterministic" ? "deterministic" : "chaotic"; i += 1; }
    else if (key === "--max-turns") { options.maxTurns = Math.max(1, Number.parseInt(value, 10) || options.maxTurns); i += 1; }
    else if (key === "--seed") { options.seed = Number.parseInt(value, 10) || options.seed; i += 1; }
    else if (key === "--ai-budget-ms") { options.aiBudgetMs = Math.max(1, Number.parseInt(value, 10) || options.aiBudgetMs); i += 1; }
    else if (key === "--trace-mode") { options.traceMode = value === "full" ? "full" : "light"; i += 1; }
    else if (key === "--baseline-config") { options.baselineConfig = value; i += 1; }
    else if (key === "--candidate-config") { options.candidateConfig = value; i += 1; }
  }
  return options;
}

function runNode(scriptArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, scriptArgs, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed (${code}): node ${scriptArgs.join(" ")}`));
    });
  });
}

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
}

async function cleanJsonAndMd(target) {
  await ensureDir(target);
  const entries = await fs.readdir(target, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && (entry.name.endsWith(".json") || entry.name.endsWith(".md")))
    .map((entry) => fs.rm(path.join(target, entry.name), { force: true })));
}

function pct(part, total) {
  if (!total) {
    return 0;
  }
  return Number(((part / total) * 100).toFixed(3));
}

function getAllKeys(a = {}, b = {}) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
}

function diffMap(base = {}, candidate = {}, totals = { baseline: 0, candidate: 0 }) {
  const output = {};
  for (const key of getAllKeys(base, candidate)) {
    const baseValue = Number(base[key] ?? 0);
    const candidateValue = Number(candidate[key] ?? 0);
    output[key] = {
      baseline: baseValue,
      candidate: candidateValue,
      delta: candidateValue - baseValue,
      baselinePct: pct(baseValue, totals.baseline),
      candidatePct: pct(candidateValue, totals.candidate),
      deltaPct: Number((pct(candidateValue, totals.candidate) - pct(baseValue, totals.baseline)).toFixed(3)),
    };
  }
  return output;
}

function diffScalar(baseSummary, candidateSummary, key) {
  const baseValue = Number(baseSummary?.[key] ?? 0);
  const candidateValue = Number(candidateSummary?.[key] ?? 0);
  return {
    baseline: baseValue,
    candidate: candidateValue,
    delta: Number((candidateValue - baseValue).toFixed(6)),
  };
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# CubeChess A/B Batch Comparison");
  lines.push("");
  lines.push(`- Games: ${report.meta.games}`);
  lines.push(`- Seed: ${report.meta.seed}`);
  lines.push(`- Mode: ${report.meta.mode}`);
  lines.push(`- Trace mode: ${report.meta.traceMode}`);
  lines.push("");
  lines.push("## Scalars");
  for (const [key, value] of Object.entries(report.scalars)) {
    lines.push(`- ${key}: baseline=${value.baseline}, candidate=${value.candidate}, delta=${value.delta}`);
  }
  lines.push("");
  lines.push("## Winner Delta (pct)");
  for (const [key, value] of Object.entries(report.winners)) {
    lines.push(`- ${key}: ${value.baselinePct}% -> ${value.candidatePct}% (delta ${value.deltaPct}%)`);
  }
  lines.push("");
  lines.push("## Persona Wins Delta (pct)");
  for (const [key, value] of Object.entries(report.personaWins)) {
    lines.push(`- ${key}: ${value.baselinePct}% -> ${value.candidatePct}% (delta ${value.deltaPct}%)`);
  }
  lines.push("");
  lines.push("## Piece Type Delta (share of turns)");
  const totalTurnsBase = Number(report.scalars.totalTurns.baseline || 0);
  const totalTurnsCandidate = Number(report.scalars.totalTurns.candidate || 0);
  for (const [key, value] of Object.entries(report.pieceTypes)) {
    const basePct = pct(value.baseline, totalTurnsBase);
    const candidatePct = pct(value.candidate, totalTurnsCandidate);
    const deltaPct = Number((candidatePct - basePct).toFixed(3));
    lines.push(`- ${key}: ${basePct}% -> ${candidatePct}% (delta ${deltaPct}%)`);
  }
  lines.push("");
  return lines.join("\n");
}

async function readSummary(inputDir) {
  const file = path.join(inputDir, "batch-summary.json");
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw);
}

async function runBatchAndAnalyze(targetDir, options, configPath) {
  if (options.clean) {
    await cleanJsonAndMd(targetDir);
  } else {
    await ensureDir(targetDir);
  }

  const batchArgs = [
    "Tests/Telemetry/runParallelBatchSelfPlay.js",
    "--games", String(options.games),
    "--workers", String(options.workers),
    "--outdir", targetDir,
    "--mode", options.mode,
    "--max-turns", String(options.maxTurns),
    "--seed", String(options.seed),
    "--ai-budget-ms", String(options.aiBudgetMs),
    "--trace-mode", options.traceMode,
    "--clean",
  ];
  if (configPath) {
    batchArgs.push("--config", configPath);
  }

  await runNode(batchArgs);
  await runNode(["Tests/Telemetry/analyzeBatchTelemetry.js", "--input", targetDir]);
  return readSummary(targetDir);
}

async function main() {
  const options = parseArgs(process.argv);
  const baselineDir = path.join(options.outdir, "baseline");
  const candidateDir = path.join(options.outdir, "candidate");

  await ensureDir(options.outdir);

  console.log("Running baseline batch...");
  const baselineSummary = await runBatchAndAnalyze(baselineDir, options, options.baselineConfig);

  console.log("Running candidate batch...");
  const candidateSummary = await runBatchAndAnalyze(candidateDir, options, options.candidateConfig);

  const report = {
    meta: {
      games: options.games,
      seed: options.seed,
      mode: options.mode,
      traceMode: options.traceMode,
      baselineConfig: options.baselineConfig,
      candidateConfig: options.candidateConfig,
      baselineDir,
      candidateDir,
      generatedAt: new Date().toISOString(),
    },
    scalars: {
      gameCount: diffScalar(baselineSummary, candidateSummary, "gameCount"),
      totalTurns: diffScalar(baselineSummary, candidateSummary, "totalTurns"),
      avgTurnsPerGame: diffScalar(baselineSummary, candidateSummary, "avgTurnsPerGame"),
      avgUniqueMoveRatio: diffScalar(baselineSummary, candidateSummary, "avgUniqueMoveRatio"),
      safetyBreakRate: diffScalar(baselineSummary, candidateSummary, "safetyBreakRate"),
      avgPersonaRiskRejectedPerTurn: diffScalar(baselineSummary, candidateSummary, "avgPersonaRiskRejectedPerTurn"),
      avgPersonaPoolPerTurn: diffScalar(baselineSummary, candidateSummary, "avgPersonaPoolPerTurn"),
    },
    winners: diffMap(baselineSummary.winners, candidateSummary.winners, { baseline: options.games, candidate: options.games }),
    personaWins: diffMap(baselineSummary.personaWins, candidateSummary.personaWins, { baseline: options.games, candidate: options.games }),
    pieceTypes: diffMap(baselineSummary.pieceTypes, candidateSummary.pieceTypes, { baseline: Number(baselineSummary.totalTurns ?? 0), candidate: Number(candidateSummary.totalTurns ?? 0) }),
    selectedBy: diffMap(baselineSummary.selectedBy, candidateSummary.selectedBy, { baseline: Number(baselineSummary.totalTurns ?? 0), candidate: Number(candidateSummary.totalTurns ?? 0) }),
  };

  const outJson = path.join(options.outdir, "ab-summary.json");
  const outMd = path.join(options.outdir, "ab-summary.md");
  await fs.writeFile(outJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(outMd, toMarkdown(report), "utf8");

  console.log("A/B comparison complete.");
  console.log(`- report json: ${outJson}`);
  console.log(`- report md:   ${outMd}`);
}

main().catch((error) => {
  console.error("A/B batch compare failed:", error.message || error);
  process.exitCode = 1;
});

