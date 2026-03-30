function coordSignature(coord) {
  if (!coord) {
    return "-";
  }
  return `${coord.x},${coord.y},${coord.z}`;
}

function moveSignature(move) {
  if (!move) {
    return "move:-";
  }
  return `${move.pieceId ?? "piece"}:${coordSignature(move.from)}>${coordSignature(move.to)}:${move.capturedPieceId ?? "-"}`;
}

function hashString32(value) {
  const input = String(value ?? "");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildMatchStateHash(snapshot) {
  const pieces = Array.isArray(snapshot?.pieces)
    ? [...snapshot.pieces].sort((a, b) => String(a?.id ?? "").localeCompare(String(b?.id ?? "")))
    : [];
  const pieceSection = pieces
    .map((piece) => {
      const alive = piece?.alive === true ? "1" : "0";
      const coord = alive === "1" ? coordSignature(piece?.coord) : "-";
      return `${piece?.id ?? "piece"}|${piece?.owner ?? "owner"}|${piece?.type ?? "type"}|${alive}|${coord}`;
    })
    .join(";");

  const eliminated = Array.isArray(snapshot?.eliminatedPlayers)
    ? [...snapshot.eliminatedPlayers].map((value) => String(value)).sort().join(",")
    : "";

  return hashString32(
    [
      `turn:${snapshot?.turnCount ?? 0}`,
      `active:${snapshot?.activePlayer ?? "-"}`,
      `eliminated:${eliminated}`,
      `last:${moveSignature(snapshot?.lastMove)}`,
      `pieces:${pieceSection}`,
    ].join("|")
  );
}

export function buildDuelRepetitionStateKey(snapshot) {
  const pieces = Array.isArray(snapshot?.pieces)
    ? [...snapshot.pieces].filter((piece) => piece?.alive !== false).sort((a, b) => String(a?.id ?? "").localeCompare(String(a?.id ?? "").localeCompare ? String(b?.id ?? "") : String(b?.id ?? "")))
    : [];
  const pieceSection = pieces
    .map((piece) => {
      const coord = coordSignature(piece?.coord);
      const hasMoved = piece?.hasMoved === true ? "1" : "0";
      return `${piece?.id ?? "piece"}|${piece?.owner ?? "owner"}|${piece?.type ?? "type"}|${coord}|${hasMoved}`;
    })
    .join(";");

  const enPassant = snapshot?.enPassantTarget
    ? [
      snapshot.enPassantTarget.vulnerablePawnId ?? "-",
      coordSignature(snapshot.enPassantTarget.captureSquare),
      coordSignature(snapshot.enPassantTarget.passedThroughSquare),
      snapshot.enPassantTarget.eligiblePlayer ?? "-",
    ].join(":")
    : "-";

  return hashString32(
    [
      `active:${snapshot?.activePlayer ?? "-"}`,
      `pieces:${pieceSection}`,
      `ep:${enPassant}`,
    ].join("|")
  );
}

export function buildDecisionContextHash({
  matchStateSnapshot,
  player,
  legalMoves,
  behaviorContext,
  aiBudgetMs,
  dangerConfig,
  candidateConfig,
}) {
  const stateHash = buildMatchStateHash(matchStateSnapshot);

  const legalMoveSection = Array.isArray(legalMoves)
    ? [...legalMoves]
      .map((move) => moveSignature(move))
      .sort()
      .join(";")
    : "";

  const pieceMoveCounts = Array.isArray(behaviorContext?.pieceMoveCountsById)
    ? [...behaviorContext.pieceMoveCountsById]
      .map(([pieceId, count]) => [String(pieceId), Number(count) || 0])
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([pieceId, count]) => `${pieceId}:${count}`)
      .join(";")
    : "";

  const recentMoves = Array.isArray(behaviorContext?.recentMoves)
    ? behaviorContext.recentMoves
      .map((move) => `${move?.player ?? "-"}:${moveSignature(move)}`)
      .join(";")
    : "";

  const dangerSection = dangerConfig
    ? JSON.stringify({
      stageCandidateLimits: dangerConfig.stageCandidateLimits ?? [],
      stageOpponentMoveLimits: dangerConfig.stageOpponentMoveLimits ?? [],
      dangerWeight: dangerConfig.dangerWeight ?? 0,
      budgetFraction: dangerConfig.budgetFraction ?? 0,
      budgetMinMs: dangerConfig.budgetMinMs ?? 0,
      budgetMaxMs: dangerConfig.budgetMaxMs ?? 0,
    })
    : "";

  const candidateSection = candidateConfig
    ? JSON.stringify({
      poolLimit: candidateConfig.poolLimit ?? 0,
      minPerPiece: candidateConfig.minPerPiece ?? 0,
    })
    : "";

  return hashString32(
    [
      `state:${stateHash}`,
      `player:${player ?? "-"}`,
      `budget:${Number(aiBudgetMs) || 0}`,
      `legal:${legalMoveSection}`,
      `pieceCounts:${pieceMoveCounts}`,
      `recent:${recentMoves}`,
      `danger:${dangerSection}`,
      `candidate:${candidateSection}`,
    ].join("|")
  );
}
