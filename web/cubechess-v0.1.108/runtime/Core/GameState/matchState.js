import { TURN_ORDER } from "./constants.js";

export class MatchState {
  constructor({
    pieces,
    activePlayer,
    eliminatedPlayers = [],
    turnCount = 0,
    lastMove = null,
  }) {
    if (!Array.isArray(pieces)) {
      throw new Error("MatchState pieces must be an array");
    }
    if (!TURN_ORDER.includes(activePlayer)) {
      throw new Error(`Invalid active player: ${activePlayer}`);
    }

    this.pieces = pieces;
    this.activePlayer = activePlayer;
    this.eliminatedPlayers = new Set(eliminatedPlayers);
    this.turnCount = turnCount;
    this.lastMove = lastMove;
  }

  toJSON() {
    return {
      pieces: this.pieces,
      activePlayer: this.activePlayer,
      eliminatedPlayers: [...this.eliminatedPlayers],
      turnCount: this.turnCount,
      lastMove: this.lastMove,
    };
  }
}
