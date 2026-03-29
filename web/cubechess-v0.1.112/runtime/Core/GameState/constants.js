export const BOARD_SIZE = 8;

export const PlayerId = Object.freeze({
  Yellow: "Yellow",
  Red: "Red",
  Purple: "Purple",
  Blue: "Blue",
  Green: "Green",
  Orange: "Orange",
  Pink: "Pink",
  Cyan: "Cyan",
});

export const PIECE_TYPES = Object.freeze({
  King: "King",
  Queen: "Queen",
  Rook: "Rook",
  Bishop: "Bishop",
  Knight: "Knight",
});

export const TURN_ORDER = Object.freeze([
  PlayerId.Yellow,
  PlayerId.Red,
  PlayerId.Purple,
  PlayerId.Blue,
  PlayerId.Green,
  PlayerId.Orange,
  PlayerId.Pink,
  PlayerId.Cyan,
]);

export function assertNever(_value, message = "Unexpected value") {
  throw new Error(message);
}
