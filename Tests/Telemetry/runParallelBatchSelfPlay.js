import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";

const DEFAULTS = Object.freeze({
  games: 300,
  workers: Math.max(1, (typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length) - 1),
  outdir: path.join("Tests", "game_dump", "batch"),
  maxTurns: 220,
  mode: "chaotic",
  seed: 42,
  aiBudgetMs: 10000,
  clean: false,
  traceMode: "full",
  configPath: null,
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
    if (!value) continue;
    if (key === "--games") { options.games = Math.max(1, Number.parseInt(value, 10) || options.games); i += 1; }
    else if (key === "--workers") { options.workers = Math.max(1, Number.parseInt(value, 10) || options.workers); i += 1; }
    else if (key === "--outdir") { options.outdir = value; i += 1; }
    else if (key === "--max-turns") { options.maxTurns = Math.max(1, Number.parseInt(value, 10) || options.maxTurns); i += 1; }
    else if (key === "--mode") { options.mode = value === "deterministic" ? "deterministic" : "chaotic"; i += 1; }
    else if (key === "--seed") { options.seed = Number.parseInt(value, 10) || options.seed; i += 1; }
    else if (key === "--ai-budget-ms") { options.aiBudgetMs = Math.max(1, Number.parseInt(value, 10) || options.aiBudgetMs); i += 1; }
    else if (key === "--trace-mode") { options.traceMode = value === "light" ? "light" : "full"; i += 1; }
    else if (key === "--config") { options.configPath = value; i += 1; }
  }
  options.workers = Math.min(options.workers, options.games);
  return options;
}

function buildShards(games, workers) {
  const shards = [];
  let startGame = 1;
  const base = Math.floor(games / workers);
  const remainder = games % workers;
  for (let i = 0; i < workers; i += 1) {
    const count = base + (i < remainder ? 1 : 0);
    if (count <= 0) continue;
    shards.push({ shardId: i + 1, startGame, games: count });
    startGame += count;
  }
  return shards;
}

async function cleanOutdir(outdir) {
  await fs.mkdir(outdir, { recursive: true });
  const entries = await fs.readdir(outdir, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && (entry.name.endsWith(".json") || entry.name.endsWith(".md")))
    .map((entry) => fs.rm(path.join(outdir, entry.name), { force: true })));
}

function runShard(shard, options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./runBatchWorker.js", import.meta.url), {
      type: "module",
      workerData: {
        games: shard.games,
        startGame: shard.startGame,
        shardId: shard.shardId,
        outdir: options.outdir,
        mode: options.mode,
        maxTurns: options.maxTurns,
        seed: options.seed,
        aiBudgetMs: options.aiBudgetMs,
        traceMode: options.traceMode,
        configPath: options.configPath,
      },
    });

    worker.on("message", (message) => {
      if (message?.ok) {
        resolve();
        return;
      }
      reject(new Error(message?.error ?? `Shard ${shard.shardId} failed`));
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Shard ${shard.shardId} exited with code ${code}`));
      }
    });
  });
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.clean) {
    await cleanOutdir(options.outdir);
  } else {
    await fs.mkdir(options.outdir, { recursive: true });
  }

  const shards = buildShards(options.games, options.workers);
  console.log(`Launching ${options.games} games across ${shards.length} workers -> ${options.outdir} (trace=${options.traceMode})`);
  await Promise.all(shards.map((shard) => runShard(shard, options)));
  console.log("Parallel batch complete.");
}

main().catch((error) => {
  console.error("Parallel batch failed:", error.message || error);
  process.exitCode = 1;
});
