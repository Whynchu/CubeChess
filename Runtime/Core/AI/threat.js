import { getLegalMoves } from "../Rules/legalMoves.js";

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
    const moves = getLegalMoves(matchState, occupancyMap, piece.id);
    for (const move of moves) {
      incrementCount(attackCounts, coordKey(move.to));
      if (move.capturedPieceId) {
        attackedPieceIds.add(move.capturedPieceId);
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
    threatenedFriendlyPieceIds: new Set(),
    players: opponentPlayers,
  };

  for (const opponentPlayer of opponentPlayers) {
    const map = buildThreatMapForPlayer(matchState, occupancyMap, opponentPlayer);

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
