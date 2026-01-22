// shared/engine/engine.ts
// Pure TypeScript game engine - no UI logic

// ✅ Keep types available (and avoid unused-import lint by re-exporting types)
export type {
  DartResult,
  DartHit,
  GameStateEngine,
  DriveState,
  PuntResult,
  FGTarget,
  DriveResult,
} from "./types";

import type { DartResult, DartHit, GameStateEngine } from "./types";

// ✅ Keep these imports/exports stable (you already had them)
import { getAvailableActions } from "./actions";
import { createGame } from "./lifecycle"; 
import { calculateDartYards } from "./dart";


// ✅ New split modules
import {
  applyOffenseDart as applyOffenseDartImpl,
  applyBonusDart as applyBonusDartImpl,
  chooseConversion as chooseConversionImpl,
  applyConversionDart as applyConversionDartImpl,
} from "./offense";

import {
  applyFieldGoalAttempt as applyFieldGoalAttemptImpl,
  applyPuntAttempt as applyPuntAttemptImpl,
  calculatePuntResult,
  getFGTarget,
  isValidFGSegment,
} from "./kicking";

import {
  advance as advanceImpl,
  undo as undoImpl,
  endDrive as endDriveImpl,
  endDriveWithPuntPosition as endDriveWithPuntPositionImpl,
  endDriveWithInterception as endDriveWithInterceptionImpl,
} from "./progression";

// ===========================
// Public entrypoint
// ===========================

// Canonical entrypoint for raw dart hits (manual now, camera later)
export function applyDartHit(game: GameStateEngine, hit: DartHit): GameStateEngine {
  const dartResult = calculateDartYards(hit.segment, hit.multiplier);

  // If we're awaiting a PAT/2pt attempt, route here
  if (game.awaitingConversion) {
    return applyConversionDart(game, dartResult);
  }

  // If we're awaiting a bonus dart (4th-dart cushion rule), route here
  if (game.currentDrive?.awaitingBonusDart) {
    return applyBonusDart(game, dartResult);
  }

  // Default: offensive dart throw during a drive
  return applyOffenseDart(game, dartResult);
}

// ===========================
// Re-exports (keeps imports stable across repo)
// ===========================
export { formatFieldPosition } from "./format";
export { calculateDartYards } from "./dart";
export { getAvailableActions };
export { createGame };
export { startNextDrive } from "./drive/startDrive";
export { formatDartResult } from "./dart";


// ===========================
// Offense / bonus / conversions (wired to deps)
// ===========================

export function applyOffenseDart(game: GameStateEngine, dartResult: DartResult): GameStateEngine {
  return applyOffenseDartImpl(game, dartResult, {
    updateScore,
    endDrive: endDriveImpl,
    endDriveWithInterception: endDriveWithInterceptionImpl,
  });
}

export function applyBonusDart(game: GameStateEngine, dartResult: DartResult): GameStateEngine {
  return applyBonusDartImpl(game, dartResult, {
    updateScore,
    endDrive: endDriveImpl,
  });
}

export function chooseConversion(game: GameStateEngine, type: "pat" | "two_point"): GameStateEngine {
  return chooseConversionImpl(game, type);
}

export function applyConversionDart(game: GameStateEngine, dartResult: DartResult): GameStateEngine {
  return applyConversionDartImpl(game, dartResult, {
    updateScore,
    endDrive: endDriveImpl,
  });
}

// ===========================
// Kicking (re-export helpers + wire attempts)
// ===========================

export { calculatePuntResult, getFGTarget, isValidFGSegment };

export function applyFieldGoalAttempt(game: GameStateEngine, dartResult: DartResult): GameStateEngine {
  return applyFieldGoalAttemptImpl(game, dartResult, {
    endDrive: endDriveImpl,
    updateScore,
  });
}

export function applyPuntAttempt(game: GameStateEngine, dartResult: DartResult): GameStateEngine {
  return applyPuntAttemptImpl(game, dartResult, {
    endDriveWithPuntPosition: endDriveWithPuntPositionImpl,
  });
}

// ===========================
// Progression
// ===========================

export function advance(game: GameStateEngine): GameStateEngine {
  return advanceImpl(game);
}

export function undo(game: GameStateEngine): GameStateEngine {
  return undoImpl(game);
}

// ===========================
// Internal helper
// ===========================

function updateScore(game: GameStateEngine, playerId: string, points: number): GameStateEngine {
  if (playerId === game.player1Id) {
    return { ...game, player1Score: game.player1Score + points };
  }
  return { ...game, player2Score: game.player2Score + points };
}
