// shared/engine/drive/startDrive.ts
import type { GameStateEngine, DriveState } from "../types";
import { generateId } from "../ids";
import { formatFieldPosition } from "../format";

// Start a new drive
export function startNextDrive(
  game: GameStateEngine,
  startPosition: number = 30,
): GameStateEngine {
  const currentPlayerId =
    game.possession === 1 ? game.player1Id : game.player2Id;

  const drive: DriveState = {
    id: generateId(),
    playerId: currentPlayerId,
    quarter: game.currentQuarter,
    startPosition,
    currentPosition: startPosition,
    dartCount: 0,
    yardsGained: 0,
    result: null,
    pointsScored: 0,
    awaitingBonusDart: false,
    usedBonusDart: false,
  };

  const updatedGame: GameStateEngine = {
    ...game,
    currentDrive: drive,
    drives: [...game.drives, drive],
    events: [
      ...game.events,
      {
        id: generateId(),
        type: "drive_start",
        playerId: currentPlayerId,
        driveId: drive.id,
        data: { startPosition, quarter: game.currentQuarter },
        description: `Drive started at ${formatFieldPosition(startPosition)}`,
        timestamp: Date.now(),
      },
    ],
  };

  return updatedGame;
}