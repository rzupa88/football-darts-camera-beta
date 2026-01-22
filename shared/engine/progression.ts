// shared/engine/progression.ts
import { GameStateEngine } from "./types";
import { generateId } from "./ids";
import { startNextDrive } from "./drive/startDrive";

const DRIVES_PER_PLAYER_PER_QUARTER = 2;

export function advance(game: GameStateEngine): GameStateEngine {
  if (game.status === "completed") return game;
  if (game.currentDrive) return game;
  if (game.awaitingConversion) return game;

  const puntPosition = (game as any)._nextDriveStartPosition;
  delete (game as any)._nextDriveStartPosition;

  return startNextDrive(game, puntPosition ?? 30);
}

export function endDrive(game: GameStateEngine): GameStateEngine {
  if (!game.currentDrive) return game;

  const drive = game.currentDrive;

  const updatedGame: GameStateEngine = {
    ...game,
    currentDrive: null,
    events: [
      ...game.events,
      {
        id: generateId(),
        type: "drive_end",
        playerId: drive.playerId,
        driveId: drive.id,
        data: { result: drive.result, points: drive.pointsScored },
        description: `Drive ended: ${drive.result}`,
        timestamp: Date.now(),
      },
    ],
  };

  // Track overtime possessions
  if (game.status === "overtime") {
    if (drive.playerId === game.player1Id) updatedGame.overtimePossessions.player1++;
    else updatedGame.overtimePossessions.player2++;
  }

  // OT period end (each player gets 2 drives)
  if (game.status === "overtime") {
    const DRIVES_PER_PLAYER_PER_OT = 2;
    const bothCompletedPeriod =
      updatedGame.overtimePossessions.player1 >= DRIVES_PER_PLAYER_PER_OT &&
      updatedGame.overtimePossessions.player2 >= DRIVES_PER_PLAYER_PER_OT;

    if (bothCompletedPeriod) {
      if (updatedGame.player1Score !== updatedGame.player2Score) {
        return endGame(updatedGame);
      }
      return startNewOTPeriod(updatedGame);
    }
  }

  // Switch possession
  updatedGame.possession = updatedGame.possession === 1 ? 2 : 1;

  // Quarter end
  const currentQuarterDrives = updatedGame.drives.filter((d) => d.quarter === updatedGame.currentQuarter);
  const player1Drives = currentQuarterDrives.filter((d) => d.playerId === game.player1Id).length;
  const player2Drives = currentQuarterDrives.filter((d) => d.playerId === game.player2Id).length;

  if (player1Drives >= DRIVES_PER_PLAYER_PER_QUARTER && player2Drives >= DRIVES_PER_PLAYER_PER_QUARTER) {
    return endQuarter(updatedGame);
  }

  return updatedGame;
}

export function endDriveWithPuntPosition(game: GameStateEngine, nextStartPosition: number): GameStateEngine {
  const updatedGame = endDrive(game);
  (updatedGame as any)._nextDriveStartPosition = nextStartPosition;
  return updatedGame;
}

export function endDriveWithInterception(game: GameStateEngine, interceptionPosition: number): GameStateEngine {
  const opponentStartPosition = 100 - interceptionPosition;
  const updatedGame = endDrive(game);
  (updatedGame as any)._nextDriveStartPosition = opponentStartPosition;
  return updatedGame;
}

function endQuarter(game: GameStateEngine): GameStateEngine {
  const nextQuarter = game.currentQuarter + 1;

  const updatedGame: GameStateEngine = {
    ...game,
    events: [
      ...game.events,
      {
        id: generateId(),
        type: "quarter_end",
        playerId: game.possession === 1 ? game.player1Id : game.player2Id,
        driveId: null,
        data: { quarter: game.currentQuarter },
        description: `Quarter ${game.currentQuarter} ended`,
        timestamp: Date.now(),
      },
    ],
  };

  if (nextQuarter > 4) {
    if (game.player1Score === game.player2Score) return startOvertime(updatedGame);
    return endGame(updatedGame);
  }

  updatedGame.currentQuarter = nextQuarter;

  if (nextQuarter === 3) {
    updatedGame.possession = game.firstPossession === 1 ? 2 : 1;
  }

  return updatedGame;
}

function startOvertime(game: GameStateEngine): GameStateEngine {
  return {
    ...game,
    status: "overtime",
    currentQuarter: 5,
    overtimePossessions: { player1: 0, player2: 0 },
    otFirstPossession: game.possession,
    events: [
      ...game.events,
      {
        id: generateId(),
        type: "overtime_start",
        playerId: game.possession === 1 ? game.player1Id : game.player2Id,
        driveId: null,
        data: {},
        description: "Overtime started!",
        timestamp: Date.now(),
      },
    ],
  };
}

function startNewOTPeriod(game: GameStateEngine): GameStateEngine {
  const otPeriod = game.currentQuarter - 4;
  const nextOtPeriod = otPeriod + 1;
  const startingPossession = game.otFirstPossession ?? game.possession;

  return {
    ...game,
    currentQuarter: 5 + nextOtPeriod - 1,
    possession: startingPossession,
    overtimePossessions: { player1: 0, player2: 0 },
    events: [
      ...game.events,
      {
        id: generateId(),
        type: "overtime_start",
        playerId: startingPossession === 1 ? game.player1Id : game.player2Id,
        driveId: null,
        data: { period: nextOtPeriod },
        description: `Overtime Period ${nextOtPeriod} - Still tied!`,
        timestamp: Date.now(),
      },
    ],
  };
}

function endGame(game: GameStateEngine): GameStateEngine {
  const winnerId =
    game.player1Score > game.player2Score
      ? game.player1Id
      : game.player2Score > game.player1Score
        ? game.player2Id
        : null;

  return {
    ...game,
    status: "completed",
    winnerId,
    events: [
      ...game.events,
      {
        id: generateId(),
        type: "game_end",
        playerId: winnerId ?? game.player1Id,
        driveId: null,
        data: {
          player1Score: game.player1Score,
          player2Score: game.player2Score,
          winnerId,
        },
        description: winnerId
          ? `Game Over! Final: ${game.player1Score} - ${game.player2Score}`
          : `Game ended in a tie: ${game.player1Score} - ${game.player2Score}`,
        timestamp: Date.now(),
      },
    ],
  };
}

// keep this here for now
export function undo(game: GameStateEngine): GameStateEngine {
  if (game.events.length <= 1) return game;
  const events = game.events.slice(0, -1);
  return { ...game, events };
}
