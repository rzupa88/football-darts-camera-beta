// shared/engine/actions.ts
import { AvailableActionsEngine, GameStateEngine } from "./types";

export function getAvailableActions(game: GameStateEngine): AvailableActionsEngine {
  if (game.status === "completed") {
    return {
      canThrowDart: false,
      canAttemptFG: false,
      canPunt: false,
      canChooseConversion: false,
      canUseBonusDart: false,
    };
  }

  if (game.awaitingConversion) {
    return {
      canThrowDart: false,
      canAttemptFG: false,
      canPunt: false,
      canChooseConversion: true,
      canUseBonusDart: false,
    };
  }

  if (!game.currentDrive) {
    return {
      canThrowDart: false,
      canAttemptFG: false,
      canPunt: false,
      canChooseConversion: false,
      canUseBonusDart: false,
    };
  }

  const drive = game.currentDrive;
  const position = drive.currentPosition;
  const dartCount = drive.dartCount;

  // 4th-dart cushion: if awaiting bonus dart, only that option
  if (drive.awaitingBonusDart) {
    return {
      canThrowDart: false,
      canAttemptFG: false,
      canPunt: false,
      canChooseConversion: false,
      canUseBonusDart: true,
    };
  }

  // Can always throw if under 4 darts
  const canThrowDart = dartCount < 4;

  // Can attempt FG if position >= 50 (in opponent territory or at midfield)
  const canAttemptFG = position >= 50;

  // Can only punt on 4th dart and position < 50
  const canPunt = dartCount === 3 && position < 50;

  return {
    canThrowDart,
    canAttemptFG,
    canPunt,
    canChooseConversion: false,
    canUseBonusDart: false,
  };
}
