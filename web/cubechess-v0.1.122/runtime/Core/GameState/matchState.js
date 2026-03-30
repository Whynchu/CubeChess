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
    enPassantTarget = null,
    noProgressHalfmoveClock = 0,
    repetitionCounts = null,
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
    this.enPassantTarget = enPassantTarget ? {
      vulnerablePawnId: enPassantTarget.vulnerablePawnId,
      captureSquare: enPassantTarget.captureSquare ? { ...enPassantTarget.captureSquare } : null,
      passedThroughSquare: enPassantTarget.passedThroughSquare ? { ...enPassantTarget.passedThroughSquare } : null,
      eligiblePlayer: enPassantTarget.eligiblePlayer,
      expiresAfterTurn: Number(enPassantTarget.expiresAfterTurn ?? 0),
    } : null;
    this.noProgressHalfmoveClock = Math.max(0, Number(noProgressHalfmoveClock ?? 0) || 0);
    this.repetitionCounts = repetitionCounts && typeof repetitionCounts === "object"
      ? { ...repetitionCounts }
      : {};
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
      enPassantTarget: this.enPassantTarget ? { ...this.enPassantTarget } : null,
      noProgressHalfmoveClock: this.noProgressHalfmoveClock,
      repetitionCounts: { ...this.repetitionCounts },
    };
  }
}
