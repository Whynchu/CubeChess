import { Coord3 } from "../GameState/coord3.js";
import { MatchState } from "../GameState/matchState.js";
import { OccupancyMap } from "../GameState/occupancyMap.js";
import { Piece } from "../GameState/piece.js";
import { PIECE_TYPES } from "../GameState/constants.js";
import { getThreatenedCoordsForPiece } from "../Rules/legalMoves.js";
import { collectLegalMovesForPlayer } from "../Turn/turnStateMachine.js";

function coordKey(coord) {
  return `${coord.x},${coord.y},${coord.z}`;
}

function incrementCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function buildThreatMapForPlayer(matchState, occupancyMap, player) {
  const attackCounts = new Map();
  const attackedPieceIds = new Set();

  const pieces = matchState.pieces
    .filter((piece) => piece.alive && piece.owner === player)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const piece of pieces) {
    const threatened = getThreatenedCoordsForPiece(matchState, occupancyMap, piece.id);
    for (const coord of threatened) {
      incrementCount(attackCounts, coordKey(coord));
      const occupant = occupancyMap.tryGetPieceAt(coord);
      if (occupant && occupant.owner !== player) {
        attackedPieceIds.add(occupant.id);
      }
    }
  }

  return {
    player,
    attackCounts,
    attackedPieceIds,
  };
}

export function createTurnThreatContext({ matchState, occupancyMap, player }) {
  const friendly = buildThreatMapForPlayer(matchState, occupancyMap, player);

  const opponentPlayers = [...new Set(
    matchState.pieces
      .filter((piece) => piece.alive && piece.owner !== player)
      .map((piece) => piece.owner)
  )].sort((a, b) => a.localeCompare(b));

  const opponent = {
    attackCounts: new Map(),
    attackCountsByPlayer: new Map(),
    threatenedFriendlyPieceIds: new Set(),
    players: opponentPlayers,
  };

  for (const opponentPlayer of opponentPlayers) {
    const map = buildThreatMapForPlayer(matchState, occupancyMap, opponentPlayer);
    opponent.attackCountsByPlayer.set(opponentPlayer, map.attackCounts);

    for (const [key, count] of map.attackCounts) {
      opponent.attackCounts.set(key, (opponent.attackCounts.get(key) ?? 0) + count);
    }

    for (const pieceId of map.attackedPieceIds) {
      const attacked = matchState.pieces.find((piece) => piece.id === pieceId);
      if (attacked?.owner === player) {
        opponent.threatenedFriendlyPieceIds.add(pieceId);
      }
    }
  }

  return {
    player,
    friendly,
    opponent,
  };
}

function cloneMatchContext(matchState) {
  const pieces = matchState.pieces.map((piece) => new Piece({
    id: piece.id,
    owner: piece.owner,
    type: piece.type,
    coord: Coord3.from(piece.coord),
    alive: piece.alive,
    forward: piece.forward,
  }));

  const clone = new MatchState({
    pieces,
    activePlayer: matchState.activePlayer,
    eliminatedPlayers: [...matchState.eliminatedPlayers],
    turnCount: matchState.turnCount,
    lastMove: matchState.lastMove,
    turnOrder: [...(matchState.turnOrder ?? [])],
    gameModeId: matchState.gameModeId,
    resultType: matchState.resultType ?? null,
  });

  const occupancy = new OccupancyMap();
  for (const piece of pieces) {
    if (piece.alive) {
      occupancy.place(piece);
    }
  }

  return { matchState: clone, occupancyMap: occupancy };
}

function eliminatePlayer(matchState, occupancyMap, player) {
  if (matchState.eliminatedPlayers.has(player)) {
    return;
  }

  matchState.eliminatedPlayers.add(player);
  for (const piece of matchState.pieces) {
    if (!piece.alive || piece.owner !== player) {
      continue;
    }
    piece.alive = false;
    occupancyMap.remove(piece.id);
  }
}

function applyMoveToClone(matchState, occupancyMap, move) {
  const piece = matchState.pieces.find((candidate) => candidate.alive && candidate.id === move.pieceId);
  if (!piece) {
    return false;
  }

  const destination = Coord3.from(move.to);
  const target = occupancyMap.tryGetPieceAt(destination);
  if (target && target.owner === piece.owner) {
    return false;
  }

  if (target) {
    target.alive = false;
    occupancyMap.remove(target.id);
    if (target.type === PIECE_TYPES.King) {
      eliminatePlayer(matchState, occupancyMap, target.owner);
    }
  }

  const moved = occupancyMap.move(piece, destination);
  if (!moved) {
    return false;
  }

  matchState.lastMove = {
    pieceId: move.pieceId,
    from: move.from,
    to: move.to,
    isCapture: Boolean(move.capturedPieceId),
    capturedPieceId: move.capturedPieceId ?? null,
  };

  return true;
}

function findAliveKingId(matchState, player) {
  return matchState.pieces.find((piece) => piece.alive && piece.owner === player && piece.type === PIECE_TYPES.King)?.id ?? null;
}

function isKingCapturableAfterMove({ matchState, occupancyMap, player, move }) {
  const clone = cloneMatchContext(matchState);
  if (!applyMoveToClone(clone.matchState, clone.occupancyMap, move)) {
    return true;
  }

  const kingId = findAliveKingId(clone.matchState, player);
  if (!kingId) {
    return true;
  }

  const opponents = [...new Set(
    clone.matchState.pieces
      .filter((piece) => piece.alive && piece.owner !== player && !clone.matchState.eliminatedPlayers.has(piece.owner))
      .map((piece) => piece.owner)
  )];

  for (const opponent of opponents) {
    const legalMoves = collectLegalMovesForPlayer(clone.matchState, clone.occupancyMap, opponent);
    if (legalMoves.some((candidate) => candidate.capturedPieceId === kingId)) {
      return true;
    }
  }
  return false;
}

export function filterImmediateKingCaptureUnsafeCandidates({
  scoredMoves,
  matchState,
  occupancyMap,
  player,
  maxChecks = 16,
}) {
  if (!Array.isArray(scoredMoves) || scoredMoves.length === 0) {
    return {
      filteredMoves: Array.isArray(scoredMoves) ? scoredMoves : [],
      checkedCount: 0,
      unsafeRejectedCount: 0,
      usedFallback: false,
    };
  }

  const checkedLimit = Math.max(1, Math.min(scoredMoves.length, maxChecks));
  const checked = scoredMoves.slice(0, checkedLimit);
  const tail = scoredMoves.slice(checkedLimit);
  const safePrefix = [];
  let unsafeRejectedCount = 0;

  for (const entry of checked) {
    const move = entry?.move ?? null;
    if (!move || isKingCapturableAfterMove({ matchState, occupancyMap, player, move })) {
      unsafeRejectedCount += 1;
      continue;
    }
    safePrefix.push(entry);
  }

  if (safePrefix.length > 0) {
    return {
      filteredMoves: [...safePrefix, ...tail],
      checkedCount: checkedLimit,
      unsafeRejectedCount,
      usedFallback: false,
    };
  }

  return {
    filteredMoves: scoredMoves,
    checkedCount: checkedLimit,
    unsafeRejectedCount,
    usedFallback: true,
  };
}
