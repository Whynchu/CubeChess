import { TURN_ORDER } from "./constants.js";
import { GameModeId } from "../Modes/gameModes.js";

export class MatchState {
  constructor({
    pieces,
    activePlayer,
    eliminatedPlayers = [],
    turnCount = 0,
    lastMove = null,
    turnOrder = TURN_ORDER,
    gameModeId = GameModeId.Chaos8P,
    resultType = null,
  }) {
    if (!Array.isArray(pieces)) {
      throw new Error("MatchState pieces must be an array");
    }
    if (!Array.isArray(turnOrder) || turnOrder.length < 2) {
      throw new Error("MatchState turnOrder must contain at least two players");
    }
    if (!turnOrder.includes(activePlayer)) {
      throw new Error(`Invalid active player: ${activePlayer}`);
    }

    this.pieces = pieces;
    this.activePlayer = activePlayer;
    this.eliminatedPlayers = new Set(eliminatedPlayers);
    this.turnCount = turnCount;
    this.lastMove = lastMove;
    this.turnOrder = [...turnOrder];
    this.gameModeId = gameModeId;
    this.resultType = resultType;
  }

  toJSON() {
    return {
      pieces: this.pieces,
      activePlayer: this.activePlayer,
      eliminatedPlayers: [...this.eliminatedPlayers],
      turnCount: this.turnCount,
      lastMove: this.lastMove,
      turnOrder: this.turnOrder,
      gameModeId: this.gameModeId,
      resultType: this.resultType,
    };
  }
}
