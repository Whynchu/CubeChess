import { Coord3 } from "../GameState/coord3.js";
import { PIECE_TYPES, TURN_ORDER } from "../GameState/constants.js";
import { getLegalMoves } from "../Rules/legalMoves.js";
import { runAITurn } from "../AI/aiTurnRunner.js";
import { ControllerType, getControllerTypeForPlayer } from "../Seats/seatConfig.js";

export const TurnPhase = Object.freeze({
  Idle: "Idle",
  AwaitingHumanMove: "AwaitingHumanMove",
  AwaitingAIMove: "AwaitingAIMove",
  ResolvingMove: "ResolvingMove",
  MatchEnded: "MatchEnded",
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [TurnPhase.Idle]: new Set([TurnPhase.AwaitingHumanMove, TurnPhase.AwaitingAIMove, TurnPhase.ResolvingMove, TurnPhase.MatchEnded]),
  [TurnPhase.AwaitingHumanMove]: new Set([TurnPhase.ResolvingMove, TurnPhase.MatchEnded]),
  [TurnPhase.AwaitingAIMove]: new Set([TurnPhase.ResolvingMove, TurnPhase.MatchEnded]),
  [TurnPhase.ResolvingMove]: new Set([TurnPhase.Idle, TurnPhase.MatchEnded]),
  [TurnPhase.MatchEnded]: new Set([]),
});

function sortMovesGlobalDeterministic(moves) {
  return moves.sort((a, b) => {
    const pieceCompare = a.pieceId.localeCompare(b.pieceId);
    if (pieceCompare !== 0) {
      return pieceCompare;
    }
    if (a.to.x !== b.to.x) return a.to.x - b.to.x;
    if (a.to.y !== b.to.y) return a.to.y - b.to.y;
    if (a.to.z !== b.to.z) return a.to.z - b.to.z;
    if (a.isCapture !== b.isCapture) return a.isCapture ? -1 : 1;
    return 0;
  });
}

function findAlivePieceById(matchState, pieceId) {
  return matchState.pieces.find((piece) => piece.id === pieceId && piece.alive) ?? null;
}

function isSameMove(a, b) {
  if (!a || !b) {
    return false;
  }

  return a.pieceId === b.pieceId
    && a.to?.x === b.to?.x
    && a.to?.y === b.to?.y
    && a.to?.z === b.to?.z;
}

function findLegalMoveMatch(legalMoves, candidateMove) {
  if (!candidateMove) {
    return null;
  }

  return legalMoves.find((move) => isSameMove(move, candidateMove)) ?? null;
}

export function collectLegalMovesForPlayer(matchState, occupancyMap, player) {
  const playerPieces = matchState.pieces
    .filter((piece) => piece.alive && piece.owner === player)
    .sort((a, b) => a.id.localeCompare(b.id));

  const allMoves = [];
  for (const piece of playerPieces) {
    const legalMoves = getLegalMoves(matchState, occupancyMap, piece.id);
    allMoves.push(...legalMoves);
  }

  return sortMovesGlobalDeterministic(allMoves);
}

function eliminatePlayer(matchState, occupancyMap, player) {
  if (matchState.eliminatedPlayers.has(player)) {
    return;
  }

  matchState.eliminatedPlayers.add(player);
  for (const piece of matchState.pieces) {
    if (piece.owner !== player || !piece.alive) {
      continue;
    }

    piece.alive = false;
    occupancyMap.remove(piece.id);
  }
}

export function synchronizeEliminations(matchState, occupancyMap) {
  for (const player of TURN_ORDER) {
    const kingAlive = matchState.pieces.some((piece) => piece.alive && piece.owner === player && piece.type === PIECE_TYPES.King);
    if (!kingAlive) {
      eliminatePlayer(matchState, occupancyMap, player);
    }
  }
}

export function getRemainingPlayers(matchState) {
  return TURN_ORDER.filter((player) => !matchState.eliminatedPlayers.has(player));
}

export function getWinner(matchState) {
  const remainingPlayers = getRemainingPlayers(matchState);
  if (remainingPlayers.length === 1) {
    return remainingPlayers[0];
  }
  return null;
}

export function getNextActivePlayer(matchState, currentPlayer) {
  const startIndex = TURN_ORDER.indexOf(currentPlayer);
  if (startIndex === -1) {
    throw new Error(`Current player is not in TURN_ORDER: ${currentPlayer}`);
  }

  for (let offset = 1; offset <= TURN_ORDER.length; offset += 1) {
    const next = TURN_ORDER[(startIndex + offset) % TURN_ORDER.length];
    if (!matchState.eliminatedPlayers.has(next)) {
      return next;
    }
  }

  return null;
}

export function applyValidatedMove(matchState, occupancyMap, move) {
  const piece = findAlivePieceById(matchState, move.pieceId);
  if (!piece) {
    throw new Error(`Cannot apply move for missing alive piece: ${move.pieceId}`);
  }

  const destination = Coord3.from(move.to);
  const target = occupancyMap.tryGetPieceAt(destination);
  let capturedPiece = null;

  if (target && target.owner === piece.owner) {
    throw new Error("Cannot capture friendly piece");
  }

  if (target) {
    capturedPiece = target;
    capturedPiece.alive = false;
    occupancyMap.remove(capturedPiece.id);
  }

  const moved = occupancyMap.move(piece, destination);
  if (!moved) {
    throw new Error(`Destination occupied while applying move for ${move.pieceId}`);
  }

  let eliminatedPlayer = null;
  if (capturedPiece && capturedPiece.type === PIECE_TYPES.King) {
    eliminatedPlayer = capturedPiece.owner;
    eliminatePlayer(matchState, occupancyMap, eliminatedPlayer);
  }

  const committedMove = {
    pieceId: move.pieceId,
    from: move.from,
    to: move.to,
    isCapture: Boolean(capturedPiece),
    capturedPieceId: capturedPiece ? capturedPiece.id : null,
  };

  matchState.lastMove = committedMove;

  return {
    move: committedMove,
    capturedPieceId: committedMove.capturedPieceId,
    eliminatedPlayer,
  };
}

export class TurnStateMachine {
  constructor({ matchState, occupancyMap, seatConfig, aiBudgetMs = 10_000 }) {
    this.matchState = matchState;
    this.occupancyMap = occupancyMap;
    this.seatConfig = seatConfig;
    this.aiBudgetMs = aiBudgetMs;
    this.phase = TurnPhase.Idle;
    this.pendingTurn = null;
    this.winner = null;

    this.#reconcileMatchStatus();
  }

  #transition(toPhase) {
    const allowed = ALLOWED_TRANSITIONS[this.phase];
    if (!allowed.has(toPhase)) {
      throw new Error(`Invalid turn state transition: ${this.phase} -> ${toPhase}`);
    }
    this.phase = toPhase;
  }

  #reconcileMatchStatus() {
    synchronizeEliminations(this.matchState, this.occupancyMap);
    this.winner = getWinner(this.matchState);
    if (this.winner) {
      if (this.phase !== TurnPhase.MatchEnded) {
        this.phase = TurnPhase.MatchEnded;
      }
      return;
    }

    if (this.matchState.eliminatedPlayers.has(this.matchState.activePlayer)) {
      const next = getNextActivePlayer(this.matchState, this.matchState.activePlayer);
      if (next) {
        this.matchState.activePlayer = next;
      }
    }
  }

  beginTurn() {
    if (this.phase === TurnPhase.MatchEnded) {
      return { type: "MatchEnded", winner: this.winner };
    }
    if (this.phase !== TurnPhase.Idle) {
      throw new Error(`Cannot begin turn while in phase ${this.phase}`);
    }

    this.#reconcileMatchStatus();
    if (this.phase === TurnPhase.MatchEnded) {
      return { type: "MatchEnded", winner: this.winner };
    }

    const player = this.matchState.activePlayer;
    const legalMoves = collectLegalMovesForPlayer(this.matchState, this.occupancyMap, player);

    if (legalMoves.length === 0) {
      this.#transition(TurnPhase.ResolvingMove);
      const result = this.#resolvePassTurn(player);
      return { ...result, legalMoves: [] };
    }

    const controllerType = getControllerTypeForPlayer(this.seatConfig, player);
    if (controllerType !== ControllerType.Human && controllerType !== ControllerType.AI) {
      throw new Error(`No controller configured for player ${player}`);
    }

    this.pendingTurn = {
      player,
      legalMoves,
      fallbackMove: legalMoves[0],
      controllerType,
    };

    if (controllerType === ControllerType.Human) {
      this.#transition(TurnPhase.AwaitingHumanMove);
      return {
        type: TurnPhase.AwaitingHumanMove,
        player,
        controllerType,
        legalMoves,
      };
    }

    this.#transition(TurnPhase.AwaitingAIMove);
    return {
      type: TurnPhase.AwaitingAIMove,
      player,
      controllerType,
      legalMoves,
      budgetMs: this.aiBudgetMs,
    };
  }

  submitHumanMove({ player, move }) {
    if (this.phase !== TurnPhase.AwaitingHumanMove) {
      throw new Error("Human move submission is only valid during AwaitingHumanMove");
    }
    if (!this.pendingTurn) {
      throw new Error("Missing pending turn context for human move");
    }
    if (player !== this.pendingTurn.player) {
      throw new Error(`Out-of-turn human input rejected for player ${player}`);
    }

    const legalMove = findLegalMoveMatch(this.pendingTurn.legalMoves, move);
    if (!legalMove) {
      throw new Error("Submitted human move is not legal for active turn");
    }

    this.#transition(TurnPhase.ResolvingMove);
    return this.#resolveCommittedMove({ move: legalMove, controllerType: ControllerType.Human, timedOut: false });
  }

  async resolveAITurn({ requestMove, budgetMs = this.aiBudgetMs } = {}) {
    if (this.phase !== TurnPhase.AwaitingAIMove) {
      throw new Error("AI resolution is only valid during AwaitingAIMove");
    }
    if (!this.pendingTurn) {
      throw new Error("Missing pending turn context for AI move");
    }

    const pending = this.pendingTurn;
    const aiResult = await runAITurn({
      budgetMs,
      fallbackMove: pending.fallbackMove,
      requestMove: ({ budgetMs: innerBudgetMs, signal }) => {
        if (!requestMove) {
          return null;
        }
        return requestMove({
          matchState: this.matchState,
          occupancyMap: this.occupancyMap,
          player: pending.player,
          legalMoves: pending.legalMoves,
          budgetMs: innerBudgetMs,
          signal,
        });
      },
    });

    const legalMove = findLegalMoveMatch(pending.legalMoves, aiResult.move) ?? pending.fallbackMove;

    this.#transition(TurnPhase.ResolvingMove);
    return this.#resolveCommittedMove({
      move: legalMove,
      controllerType: ControllerType.AI,
      timedOut: aiResult.timedOut,
    });
  }

  #resolvePassTurn(player) {
    this.pendingTurn = null;
    this.matchState.lastMove = null;
    this.matchState.turnCount += 1;

    this.#reconcileMatchStatus();
    if (this.phase === TurnPhase.MatchEnded) {
      return {
        type: "MatchEnded",
        player,
        winner: this.winner,
        passed: true,
      };
    }

    const nextPlayer = getNextActivePlayer(this.matchState, player);
    if (!nextPlayer) {
      this.#transition(TurnPhase.MatchEnded);
      return {
        type: "MatchEnded",
        player,
        winner: this.winner,
        passed: true,
      };
    }

    this.matchState.activePlayer = nextPlayer;
    this.#transition(TurnPhase.Idle);

    return {
      type: "TurnPassed",
      player,
      passed: true,
      nextPlayer,
    };
  }

  #resolveCommittedMove({ move, controllerType, timedOut }) {
    const activePlayer = this.pendingTurn.player;
    const applied = applyValidatedMove(this.matchState, this.occupancyMap, move);

    this.pendingTurn = null;
    this.matchState.turnCount += 1;

    this.#reconcileMatchStatus();
    if (this.phase === TurnPhase.MatchEnded) {
      return {
        type: "MatchEnded",
        player: activePlayer,
        controllerType,
        timedOut,
        move: applied.move,
        eliminatedPlayer: applied.eliminatedPlayer,
        winner: this.winner,
      };
    }

    const nextPlayer = getNextActivePlayer(this.matchState, activePlayer);
    if (!nextPlayer) {
      this.#transition(TurnPhase.MatchEnded);
      return {
        type: "MatchEnded",
        player: activePlayer,
        controllerType,
        timedOut,
        move: applied.move,
        eliminatedPlayer: applied.eliminatedPlayer,
        winner: this.winner,
      };
    }

    this.matchState.activePlayer = nextPlayer;
    this.#transition(TurnPhase.Idle);

    return {
      type: "TurnResolved",
      player: activePlayer,
      controllerType,
      timedOut,
      move: applied.move,
      eliminatedPlayer: applied.eliminatedPlayer,
      nextPlayer,
    };
  }
}
