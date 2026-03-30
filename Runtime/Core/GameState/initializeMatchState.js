import { MatchState } from "./matchState.js";
import { OccupancyMap } from "./occupancyMap.js";
import { GameModeId } from "../Modes/gameModes.js";
import { generateStartingPiecesForMode, getStartingAssignmentsForMode, getTurnOrderForMode, normalizeSeatOffset } from "../Formation/formationGenerator.js";

export function initializeMatchState(options = {}) {
  const gameModeId = options.gameModeId ?? GameModeId.Chaos8P;
  const normalizedSeatOffset = normalizeSeatOffset(options.seatOffset ?? 0);
  const pieces = generateStartingPiecesForMode({ gameModeId, seatOffset: normalizedSeatOffset });
  const startingCorners = getStartingAssignmentsForMode({ gameModeId, seatOffset: normalizedSeatOffset });
  const turnOrder = [...getTurnOrderForMode({ gameModeId, seatOffset: normalizedSeatOffset })];
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
    gameModeId,
    seatOffset: normalizedSeatOffset,
    startingCorners,
    turnOrder,
  };
}
