import { MatchState } from "./matchState.js";
import { OccupancyMap } from "./occupancyMap.js";
import { generateStartingPieces, getStartingCornerAssignments, getTurnOrderForSeatOffset, normalizeSeatOffset } from "../Formation/formationGenerator.js";

export function initializeMatchState(options = {}) {
  const normalizedSeatOffset = normalizeSeatOffset(options.seatOffset ?? 0);
  const pieces = generateStartingPieces({ seatOffset: normalizedSeatOffset });
  const startingCorners = getStartingCornerAssignments(normalizedSeatOffset);
  const turnOrder = [...getTurnOrderForSeatOffset(normalizedSeatOffset)];
  const occupancyMap = new OccupancyMap();

  for (const piece of pieces) {
    const placed = occupancyMap.place(piece);
    if (!placed) {
      throw new Error(`Starting formation collision at ${piece.coord.key()} for ${piece.id}`);
    }
  }

  occupancyMap.validateNoCollisions();

  const matchState = new MatchState({
    pieces,
    activePlayer: turnOrder[0],
    eliminatedPlayers: [],
    turnCount: 0,
    lastMove: null,
    turnOrder,
  });

  return {
    matchState,
    occupancyMap,
    seatOffset: normalizedSeatOffset,
    startingCorners,
    turnOrder,
  };
}
