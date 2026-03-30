import { PIECE_TYPES } from "../GameState/constants.js";

const NON_KING_MATERIAL_VALUE = Object.freeze({
  [PIECE_TYPES.Queen]: 9,
  [PIECE_TYPES.Rook]: 5,
  [PIECE_TYPES.Bishop]: 3,
  [PIECE_TYPES.Knight]: 3,
  [PIECE_TYPES.Pawn]: 1,
});

export const BoardPhase = Object.freeze({
  Opening: "opening",
  Midgame: "midgame",
  Endgame: "endgame",
});

function sumNonKingMaterial(matchState) {
  if (!matchState?.pieces) {
    return 0;
  }

  let total = 0;
  for (const piece of matchState.pieces) {
    if (!piece.alive || piece.type === PIECE_TYPES.King) {
      continue;
    }
    total += NON_KING_MATERIAL_VALUE[piece.type] ?? 1;
  }
  return total;
}

export function classifyBoardPhase(matchState) {
  const turnCount = matchState?.turnCount ?? 0;
  const alivePieces = matchState?.pieces?.filter((piece) => piece.alive).length ?? 0;
  const nonKingMaterial = sumNonKingMaterial(matchState);

  if (nonKingMaterial <= 28 || alivePieces <= 10) {
    return BoardPhase.Endgame;
  }

  if (turnCount <= 14 && nonKingMaterial >= 56 && alivePieces >= 24) {
    return BoardPhase.Opening;
  }

  return BoardPhase.Midgame;
}
