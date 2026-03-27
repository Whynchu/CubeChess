import { PlayerId, TURN_ORDER } from "../GameState/constants.js";

export const ControllerType = Object.freeze({
  Human: "Human",
  AI: "AI",
});

function assertControllerType(value) {
  if (value !== ControllerType.Human && value !== ControllerType.AI) {
    throw new Error(`Invalid controller type: ${value}`);
  }
}

export function createSeatConfig(mapping) {
  const config = {};
  for (const player of TURN_ORDER) {
    const type = mapping[player];
    assertControllerType(type);
    config[player] = type;
  }
  return Object.freeze(config);
}

export function presetAllAI() {
  return createSeatConfig({
    [PlayerId.Yellow]: ControllerType.AI,
    [PlayerId.Red]: ControllerType.AI,
    [PlayerId.Purple]: ControllerType.AI,
    [PlayerId.Blue]: ControllerType.AI,
    [PlayerId.Green]: ControllerType.AI,
    [PlayerId.Orange]: ControllerType.AI,
    [PlayerId.Pink]: ControllerType.AI,
    [PlayerId.Cyan]: ControllerType.AI,
  });
}

export function presetOneHumanThreeAI(humanPlayer = PlayerId.Yellow) {
  if (!TURN_ORDER.includes(humanPlayer)) {
    throw new Error(`Invalid human player: ${humanPlayer}`);
  }

  const mapping = {};
  for (const player of TURN_ORDER) {
    mapping[player] = player === humanPlayer ? ControllerType.Human : ControllerType.AI;
  }
  return createSeatConfig(mapping);
}

export function presetTwoHumanTwoAI(firstHuman = PlayerId.Yellow, secondHuman = PlayerId.Purple) {
  if (!TURN_ORDER.includes(firstHuman) || !TURN_ORDER.includes(secondHuman)) {
    throw new Error("Invalid human player selection");
  }
  if (firstHuman === secondHuman) {
    throw new Error("Two-human preset requires two distinct players");
  }

  const mapping = {};
  for (const player of TURN_ORDER) {
    mapping[player] = (player === firstHuman || player === secondHuman)
      ? ControllerType.Human
      : ControllerType.AI;
  }
  return createSeatConfig(mapping);
}

export function getControllerTypeForPlayer(seatConfig, player) {
  return seatConfig[player];
}
