import { MatchState } from "./matchState.js";
import { OccupancyMap } from "./occupancyMap.js";
import { PlayerId } from "./constants.js";
import { generateStartingPieces } from "../Formation/formationGenerator.js";

export function initializeMatchState() {
  const pieces = generateStartingPieces();
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
    activePlayer: PlayerId.Yellow,
    eliminatedPlayers: [],
    turnCount: 0,
    lastMove: null,
  });

  return { matchState, occupancyMap };
}
