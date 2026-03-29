import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_INPUT = path.join("Tests", "game_dump", "batch");

function parseArgs(argv) {
  const opts = { input: DEFAULT_INPUT, out: null };
  for (let i = 2; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    if (!v) continue;
    if (k === "--input") { opts.input = v; i += 1; }
    else if (k === "--out") { opts.out = v; i += 1; }
  }
  return opts;
}

function bump(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function sortedObj(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));
}

async function readBatchFiles(inputDir) {
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && e.name.endsWith(".json")).map((e) => path.join(inputDir, e.name));
  const games = [];
  for (const file of files) {
    try {
      const json = JSON.parse(await fs.readFile(file, "utf8"));
      if (Array.isArray(json?.traces)) games.push({ file: path.basename(file), data: json });
    } catch {
      // ignore malformed files
    }
  }
  return games;
}

function analyze(games) {
  const winnerCounts = new Map();
  const personaTurns = new Map();
  const personaWins = new Map();
  const pieceTypeCounts = new Map();
  const selectedBy = new Map();
  let totalTurns = 0;
  let totalRiskRejected = 0;
  let totalPool = 0;
  let totalUniqueRatio = 0;
  let safetyBreaks = 0;

  for (const game of games) {
    const g = game.data;
    totalTurns += Number(g.traceCount ?? 0);
    totalUniqueRatio += Number(g.kpiSummary?.uniqueMoveRatio ?? 0);
    if (g.safetyBreak) safetyBreaks += 1;

    const winner = g.winner ?? "None";
    bump(winnerCounts, winner, 1);
    if (winner !== "None") {
      const winnerPersona = g.traces.find((t) => t.player === winner)?.personaId;
      if (winnerPersona) bump(personaWins, winnerPersona, 1);
    }

    for (const t of g.traces) {
      if (t?.personaId) bump(personaTurns, t.personaId, 1);
      if (t?.selectedBy) bump(selectedBy, t.selectedBy, 1);
      if (t?.selectedPieceType) bump(pieceTypeCounts, t.selectedPieceType, 1);
      totalRiskRejected += Number(t?.personaRiskRejectedCount ?? 0);
      totalPool += Number(t?.personaCandidatePoolCount ?? 0);
    }
  }

  const gameCount = games.length;
  return {
    gameCount,
    totalTurns,
    avgTurnsPerGame: gameCount > 0 ? Number((totalTurns / gameCount).toFixed(2)) : 0,
    avgUniqueMoveRatio: gameCount > 0 ? Number((totalUniqueRatio / gameCount).toFixed(3)) : 0,
    safetyBreakRate: gameCount > 0 ? Number((safetyBreaks / gameCount).toFixed(3)) : 0,
    avgPersonaRiskRejectedPerTurn: totalTurns > 0 ? Number((totalRiskRejected / totalTurns).toFixed(3)) : 0,
    avgPersonaPoolPerTurn: totalTurns > 0 ? Number((totalPool / totalTurns).toFixed(3)) : 0,
    winners: sortedObj(winnerCounts),
    personaTurns: sortedObj(personaTurns),
    personaWins: sortedObj(personaWins),
    selectedBy: sortedObj(selectedBy),
    pieceTypes: sortedObj(pieceTypeCounts),
  };
}

function toMarkdown(summary, inputDir) {
  return [
    "# CubeChess Batch Telemetry Summary",
    "",
    `- Input: ${inputDir}`,
    `- Games: ${summary.gameCount}`,
    `- Total turns: ${summary.totalTurns}`,
    `- Avg turns/game: ${summary.avgTurnsPerGame}`,
    `- Avg unique move ratio: ${summary.avgUniqueMoveRatio}`,
    `- Safety break rate: ${summary.safetyBreakRate}`,
    `- Avg persona risk rejected/turn: ${summary.avgPersonaRiskRejectedPerTurn}`,
    `- Avg persona pool/turn: ${summary.avgPersonaPoolPerTurn}`,
    "",
    "## Winners",
    "```json",
    JSON.stringify(summary.winners, null, 2),
    "```",
    "## Persona Turns",
    "```json",
    JSON.stringify(summary.personaTurns, null, 2),
    "```",
    "## Persona Wins",
    "```json",
    JSON.stringify(summary.personaWins, null, 2),
    "```",
    "## Selection Mode",
    "```json",
    JSON.stringify(summary.selectedBy, null, 2),
    "```",
    "## Piece Types",
    "```json",
    JSON.stringify(summary.pieceTypes, null, 2),
    "```",
    "",
  ].join("\n");
}

async function main() {
  const opts = parseArgs(process.argv);
  const games = await readBatchFiles(opts.input);
  if (games.length === 0) {
    throw new Error(`No telemetry JSON files found in ${opts.input}`);
  }

  const summary = analyze(games);
  const outJson = opts.out ?? path.join(opts.input, "batch-summary.json");
  const outMd = outJson.replace(/\.json$/i, ".md");

  await fs.writeFile(outJson, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await fs.writeFile(outMd, toMarkdown(summary, opts.input), "utf8");

  console.log(`Analyzed ${games.length} files.`);
  console.log(`- summary json: ${outJson}`);
  console.log(`- summary md:   ${outMd}`);
}

main().catch((error) => {
  console.error("Batch analysis failed:", error.message || error);
  process.exitCode = 1;
});
