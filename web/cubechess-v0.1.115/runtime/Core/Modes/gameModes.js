export const GameModeId = Object.freeze({
  Chaos8P: "chaos_8p",
  Duel2P: "duel_2p",
});

const MODE_DEFINITIONS = Object.freeze({
  [GameModeId.Chaos8P]: Object.freeze({
    id: GameModeId.Chaos8P,
    label: "Chaos 8P",
    activePlayers: Object.freeze(["Yellow", "Red", "Purple", "Blue", "Green", "Orange", "Pink", "Cyan"]),
    seatRotationLength: 8,
    formationId: "chaos_corners_v1",
  }),
  [GameModeId.Duel2P]: Object.freeze({
    id: GameModeId.Duel2P,
    label: "Duel 2P",
    activePlayers: Object.freeze(["Yellow", "Red"]),
    seatRotationLength: 1,
    formationId: "duel_fullside_v1",
  }),
});

export function getGameModeDefinition(gameModeId = GameModeId.Chaos8P) {
  return MODE_DEFINITIONS[gameModeId] ?? MODE_DEFINITIONS[GameModeId.Chaos8P];
}

export function getAllGameModeDefinitions() {
  return Object.freeze(Object.values(MODE_DEFINITIONS));
}
