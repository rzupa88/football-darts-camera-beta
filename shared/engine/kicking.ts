// shared/engine/kicking.ts
import { DartResult, GameStateEngine, DriveState, PuntResult, FGTarget, DriveResult } from "./types";
import { generateId } from "./ids";
import { formatDartResult } from "./dart";


// NOTE: these are currently in engine.ts. We'll export them from here now.

export function getFGTarget(position: number): FGTarget | null {
  if (position < 50) return null;

  const oppYardLine = 100 - position;

  if (oppYardLine >= 40 && oppYardLine <= 50) {
    return { segments: [20], description: "20" };
  } else if (oppYardLine <= 39) {
    return { segments: [20, 1, 5], description: "Any Segment 1-20-5" };
  }

  return null;
}

export function isValidFGSegment(segment: number, target: FGTarget): boolean {
  return target.segments.includes(segment);
}

export function calculatePuntResult(
  dartResult: DartResult,
  puntPosition: number,
): PuntResult {
  if (dartResult.multiplier === "miss") {
    const flippedPosition = 100 - puntPosition;
    return {
      receivingPosition: flippedPosition,
      returnYards: 0,
      description: `Blocked punt! Opponent takes over at OPP ${100 - flippedPosition}`,
    };
  }

  if (dartResult.isInnerBull) {
    return { receivingPosition: 5, returnYards: 0, description: "Fair catch at OWN 5" };
  }

  if (dartResult.isOuterBull) {
    return { receivingPosition: 10, returnYards: 0, description: "Fair catch at OWN 10" };
  }

  if (dartResult.multiplier === "triple") {
    const returnYards = dartResult.segment * 3;
    const startPos = 20;
    const finalPos = Math.min(startPos + returnYards, 100);
    return {
      receivingPosition: finalPos,
      returnYards,
      description: `Punt returned ${returnYards} yards from OWN 20`,
    };
  }

  if (dartResult.multiplier === "double") {
    const returnYards = dartResult.segment * 2;
    const startPos = 20;
    const finalPos = Math.min(startPos + returnYards, 100);
    return {
      receivingPosition: finalPos,
      returnYards,
      description: `Punt returned ${returnYards} yards from OWN 20`,
    };
  }

  if (dartResult.multiplier === "single_inner") {
    return { receivingPosition: 30, returnYards: 0, description: "Fair catch at OWN 30" };
  }

  return { receivingPosition: 20, returnYards: 0, description: "Fair catch at OWN 20" };
}

/**
 * These two functions need `endDrive` and `updateScore`,
 * so we accept them as injected dependencies to avoid circular imports.
 */
type EndDriveFn = (game: GameStateEngine) => GameStateEngine;
type UpdateScoreFn = (game: GameStateEngine, playerId: string, points: number) => GameStateEngine;

export function applyFieldGoalAttempt(
  game: GameStateEngine,
  dartResult: DartResult,
  deps: { endDrive: EndDriveFn; updateScore: UpdateScoreFn },
): GameStateEngine {
  if (!game.currentDrive) throw new Error("No active drive");

  const drive = game.currentDrive;
  const playerId = drive.playerId;
  const target = getFGTarget(drive.currentPosition);

  if (!target) throw new Error("Not in FG range");

  const inRange = isValidFGSegment(dartResult.segment, target);
  const isNotMiss = dartResult.multiplier !== "miss";
  const isMake = inRange && isNotMiss;

  const result: DriveResult = isMake ? "fg_make" : "fg_miss";
  const points = isMake ? 3 : 0;

  const updatedDrive: DriveState = { ...drive, result, pointsScored: points };

  let updatedGame = isMake ? deps.updateScore(game, playerId, 3) : game;
  updatedGame = {
    ...updatedGame,
    currentDrive: updatedDrive,
    drives: updatedGame.drives.map((d) => (d.id === drive.id ? updatedDrive : d)),
  };

  updatedGame.events = [
    ...updatedGame.events,
    {
      id: generateId(),
      type: "fg_attempt",
      playerId,
      driveId: drive.id,
      data: { ...dartResult, target: target.description, made: isMake },
      description: isMake
        ? `FIELD GOAL GOOD! (${formatDartResult(dartResult)}, needed ${target.description})`
        : `Field goal MISSED. (${formatDartResult(dartResult)}, needed ${target.description})`,
      timestamp: Date.now(),
    },
  ];

  return deps.endDrive(updatedGame);
}

export function applyPuntAttempt(
  game: GameStateEngine,
  dartResult: DartResult,
  deps: { endDriveWithPuntPosition: (g: GameStateEngine, nextStart: number) => GameStateEngine },
): GameStateEngine {
  if (!game.currentDrive) throw new Error("No active drive");

  const drive = game.currentDrive;
  const playerId = drive.playerId;
  const puntResult = calculatePuntResult(dartResult, drive.currentPosition);

  const updatedDrive: DriveState = { ...drive, result: "punt", pointsScored: 0 };

  const updatedGame = {
    ...game,
    currentDrive: updatedDrive,
    drives: game.drives.map((d) => (d.id === drive.id ? updatedDrive : d)),
  };

  updatedGame.events = [
    ...updatedGame.events,
    {
      id: generateId(),
      type: "punt",
      playerId,
      driveId: drive.id,
      data: { ...dartResult, ...puntResult },
      description: `Punt: ${puntResult.description}`,
      timestamp: Date.now(),
    },
  ];

  return deps.endDriveWithPuntPosition(updatedGame, puntResult.receivingPosition);
}
