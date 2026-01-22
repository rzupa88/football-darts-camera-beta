// shared/engine/offense.ts
import { DartResult, GameStateEngine, DriveState } from "./types";
import { generateId } from "./ids";
import { formatDartResult } from "./dart";
import { formatFieldPosition } from "./format";

type UpdateScoreFn = (game: GameStateEngine, playerId: string, points: number) => GameStateEngine;
type EndDriveFn = (game: GameStateEngine) => GameStateEngine;
type EndDriveWithInterceptionFn = (game: GameStateEngine, interceptionPosition: number) => GameStateEngine;

export function applyOffenseDart(
  game: GameStateEngine,
  dartResult: DartResult,
  deps: { updateScore: UpdateScoreFn; endDrive: EndDriveFn; endDriveWithInterception: EndDriveWithInterceptionFn },
): GameStateEngine {
  if (!game.currentDrive) throw new Error("No active drive");

  const drive = game.currentDrive;
  const playerId = drive.playerId;

  if (dartResult.isInnerBull) {
    const updatedDrive: DriveState = {
      ...drive,
      dartCount: drive.dartCount + 1,
      yardsGained: drive.yardsGained + (100 - drive.startPosition),
      currentPosition: 100,
      result: "td",
      pointsScored: 6,
    };

    let updatedGame = deps.updateScore(game, playerId, 6);
    updatedGame = {
      ...updatedGame,
      currentDrive: updatedDrive,
      drives: updatedGame.drives.map((d) => (d.id === drive.id ? updatedDrive : d)),
      awaitingConversion: true,
      conversionType: null,
      lastTdPlayerId: playerId,
    };

    updatedGame.events = [
      ...updatedGame.events,
      {
        id: generateId(),
        type: "dart",
        playerId,
        driveId: drive.id,
        data: { ...dartResult },
        description: `Inner Bull! Automatic touchdown!`,
        timestamp: Date.now(),
      },
      {
        id: generateId(),
        type: "touchdown",
        playerId,
        driveId: drive.id,
        data: { innerBull: true },
        description: `TOUCHDOWN! (Inner Bull)`,
        timestamp: Date.now(),
      },
    ];

    return updatedGame;
  }

  const isInterception =
    (dartResult.segment === 1 || dartResult.segment === 3) &&
    (dartResult.multiplier === "double" || dartResult.multiplier === "triple");

  if (isInterception) {
    const updatedDrive: DriveState = {
      ...drive,
      dartCount: drive.dartCount + 1,
      result: "interception",
      pointsScored: 0,
    };

    const updatedGame = {
      ...game,
      currentDrive: updatedDrive,
      drives: game.drives.map((d) => (d.id === drive.id ? updatedDrive : d)),
    };

    updatedGame.events = [
      ...updatedGame.events,
      {
        id: generateId(),
        type: "dart",
        playerId,
        driveId: drive.id,
        data: { ...dartResult },
        description: `${formatDartResult(dartResult)}`,
        timestamp: Date.now(),
      },
      {
        id: generateId(),
        type: "interception",
        playerId,
        driveId: drive.id,
        data: { segment: dartResult.segment, multiplier: dartResult.multiplier },
        description: `INTERCEPTION! ${formatDartResult(dartResult)} - Turnover at ${formatFieldPosition(drive.currentPosition)}`,
        timestamp: Date.now(),
      },
    ];

    return deps.endDriveWithInterception(updatedGame, drive.currentPosition);
  }

  const newPosition = Math.min(drive.currentPosition + dartResult.yards, 100);
  const requiredDistance = 100 - drive.startPosition;
  const totalYards = drive.yardsGained + dartResult.yards;

  if (newPosition >= 100 && totalYards === requiredDistance) {
    const updatedDrive: DriveState = {
      ...drive,
      dartCount: drive.dartCount + 1,
      yardsGained: totalYards,
      currentPosition: 100,
      result: "td",
      pointsScored: 6,
    };

    let updatedGame = deps.updateScore(game, playerId, 6);
    updatedGame = {
      ...updatedGame,
      currentDrive: updatedDrive,
      drives: updatedGame.drives.map((d) => (d.id === drive.id ? updatedDrive : d)),
      awaitingConversion: true,
      conversionType: null,
      lastTdPlayerId: playerId,
    };

    updatedGame.events = [
      ...updatedGame.events,
      {
        id: generateId(),
        type: "dart",
        playerId,
        driveId: drive.id,
        data: { ...dartResult },
        description: `${formatDartResult(dartResult)} - ${dartResult.yards} yards`,
        timestamp: Date.now(),
      },
      {
        id: generateId(),
        type: "touchdown",
        playerId,
        driveId: drive.id,
        data: { innerBull: false },
        description: `TOUCHDOWN! Reached the end zone exactly.`,
        timestamp: Date.now(),
      },
    ];

    return updatedGame;
  }

  if (totalYards > requiredDistance) {
    const updatedDrive: DriveState = {
      ...drive,
      dartCount: drive.dartCount + 1,
      yardsGained: totalYards,
      currentPosition: newPosition,
      result: "bust",
      pointsScored: 0,
    };

    const updatedGame = {
      ...game,
      currentDrive: updatedDrive,
      drives: game.drives.map((d) => (d.id === drive.id ? updatedDrive : d)),
    };

    updatedGame.events = [
      ...updatedGame.events,
      {
        id: generateId(),
        type: "dart",
        playerId,
        driveId: drive.id,
        data: { ...dartResult },
        description: `${formatDartResult(dartResult)} - ${dartResult.yards} yards`,
        timestamp: Date.now(),
      },
      {
        id: generateId(),
        type: "bust",
        playerId,
        driveId: drive.id,
        data: { overshoot: totalYards - requiredDistance },
        description: `BUST! Overshot by ${totalYards - requiredDistance} yards.`,
        timestamp: Date.now(),
      },
    ];

    return deps.endDrive(updatedGame);
  }

  const updatedDrive: DriveState = {
    ...drive,
    dartCount: drive.dartCount + 1,
    yardsGained: totalYards,
    currentPosition: newPosition,
  };

  const updatedGame = {
    ...game,
    currentDrive: updatedDrive,
    drives: game.drives.map((d) => (d.id === drive.id ? updatedDrive : d)),
  };

  updatedGame.events = [
    ...updatedGame.events,
    {
      id: generateId(),
      type: "dart",
      playerId,
      driveId: drive.id,
      data: { ...dartResult },
      description: `${formatDartResult(dartResult)} - ${dartResult.yards} yards. Now at ${formatFieldPosition(newPosition)}`,
      timestamp: Date.now(),
    },
  ];

  if (updatedDrive.dartCount >= 4) {
    const remainingDistance = 100 - newPosition;
    if (remainingDistance === 1 && !updatedDrive.usedBonusDart) {
      const originalRemaining = 100 - drive.currentPosition;
      if (originalRemaining >= 21 && originalRemaining <= 50) {
        updatedDrive.awaitingBonusDart = true;

        const updatedGame2: GameStateEngine = {
  ...updatedGame,
  currentDrive: updatedDrive,
  drives: updatedGame.drives.map((d) => (d.id === drive.id ? updatedDrive : d)),
  events: [
    ...updatedGame.events,
    {
      id: generateId(),
      type: "dart",
      playerId,
      driveId: drive.id,
      data: { bonusDartEarned: true },
      description: `At the 1-yard line! Bonus dart earned - must hit Single 1 for TD`,
      timestamp: Date.now(),
    },
  ],
};

return updatedGame2;

      }
    }

    updatedDrive.result = "bust";
    updatedGame.events = [
      ...updatedGame.events,
      {
        id: generateId(),
        type: "bust",
        playerId,
        driveId: drive.id,
        data: {},
        description: `Drive ended - 4 darts used without scoring.`,
        timestamp: Date.now(),
      },
    ];
    return deps.endDrive(updatedGame);
  }

  return updatedGame;
}

export function applyBonusDart(
  game: GameStateEngine,
  dartResult: DartResult,
  deps: { updateScore: UpdateScoreFn; endDrive: EndDriveFn },
): GameStateEngine {
  if (!game.currentDrive || !game.currentDrive.awaitingBonusDart) {
    throw new Error("No bonus dart available");
  }

  const drive = game.currentDrive;
  const playerId = drive.playerId;

  const isSingle1 =
    (dartResult.multiplier === "single_inner" || dartResult.multiplier === "single_outer") &&
    dartResult.segment === 1;

  if (isSingle1) {
    const updatedDrive: DriveState = {
      ...drive,
      awaitingBonusDart: false,
      usedBonusDart: true,
      result: "td",
      pointsScored: 6,
      currentPosition: 100,
    };

    let updatedGame = deps.updateScore(game, playerId, 6);
    updatedGame = {
      ...updatedGame,
      currentDrive: updatedDrive,
      drives: updatedGame.drives.map((d) => (d.id === drive.id ? updatedDrive : d)),
      awaitingConversion: true,
      conversionType: null,
      lastTdPlayerId: playerId,
    };

    updatedGame.events = [
      ...updatedGame.events,
      {
        id: generateId(),
        type: "dart",
        playerId,
        driveId: drive.id,
        data: { ...dartResult, bonusDart: true },
        description: `Bonus dart: ${formatDartResult(dartResult)}`,
        timestamp: Date.now(),
      },
      {
        id: generateId(),
        type: "touchdown",
        playerId,
        driveId: drive.id,
        data: { bonusDart: true },
        description: `TOUCHDOWN! (Bonus dart Single 1)`,
        timestamp: Date.now(),
      },
    ];

    return updatedGame;
  }

  const updatedDrive: DriveState = {
    ...drive,
    awaitingBonusDart: false,
    usedBonusDart: true,
    result: "bust",
    pointsScored: 0,
  };

  const updatedGame = {
    ...game,
    currentDrive: updatedDrive,
    drives: game.drives.map((d) => (d.id === drive.id ? updatedDrive : d)),
  };

  updatedGame.events = [
    ...updatedGame.events,
    {
      id: generateId(),
      type: "dart",
      playerId,
      driveId: drive.id,
      data: { ...dartResult, bonusDart: true },
      description: `Bonus dart: ${formatDartResult(dartResult)} - Needed Single 1`,
      timestamp: Date.now(),
    },
    {
      id: generateId(),
      type: "bust",
      playerId,
      driveId: drive.id,
      data: { bonusDartMissed: true },
      description: `Bonus dart missed! Drive ends.`,
      timestamp: Date.now(),
    },
  ];

  return deps.endDrive(updatedGame);
}

export function chooseConversion(
  game: GameStateEngine,
  type: "pat" | "two_point",
): GameStateEngine {
  if (!game.awaitingConversion) throw new Error("Not awaiting conversion");

  const playerId = game.lastTdPlayerId!;

  return {
    ...game,
    conversionType: type,
    events: [
      ...game.events,
      {
        id: generateId(),
        type: "conversion_choice",
        playerId,
        driveId: game.currentDrive?.id ?? null,
        data: { type },
        description: type === "pat" ? "Going for PAT (1 point)" : "Going for 2-point conversion",
        timestamp: Date.now(),
      },
    ],
  };
}

export function applyConversionDart(
  game: GameStateEngine,
  dartResult: DartResult,
  deps: { updateScore: UpdateScoreFn; endDrive: EndDriveFn },
): GameStateEngine {
  if (!game.conversionType) throw new Error("No conversion type selected");

  const playerId = game.lastTdPlayerId!;
  const type = game.conversionType;

  let success = false;
  let points = 0;

  if (type === "pat") {
    const isSingle =
      dartResult.multiplier === "single_inner" || dartResult.multiplier === "single_outer";
    success = isSingle && dartResult.segment >= 1 && dartResult.segment <= 5;
    points = success ? 1 : 0;
  } else {
    success = dartResult.segment === 2 && dartResult.multiplier !== "miss";
    points = success ? 2 : 0;
  }

  let updatedGame = success ? deps.updateScore(game, playerId, points) : game;

  updatedGame = {
    ...updatedGame,
    awaitingConversion: false,
    conversionType: null,
    lastTdPlayerId: null,
    events: [
      ...updatedGame.events,
      {
        id: generateId(),
        type: type === "pat" ? "pat_attempt" : "two_point_attempt",
        playerId,
        driveId: game.currentDrive?.id ?? null,
        data: { ...dartResult, success, points },
        description: success
          ? `${type === "pat" ? "PAT" : "2-point conversion"} GOOD! +${points}`
          : `${type === "pat" ? "PAT" : "2-point conversion"} failed.`,
        timestamp: Date.now(),
      },
    ],
  };

  return deps.endDrive(updatedGame);
}
