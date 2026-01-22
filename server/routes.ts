import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { type InsertDartThrow } from "@shared/schema";
import {
  calculateDartYards,
  formatFieldPosition,
  getFGTarget,
  calculatePuntResult,
  isValidFGSegment,
} from "@shared/engine/engine";
import type { Multiplier, DartResult } from "@shared/engine/types";
import { z } from "zod";
import { getMatchupLine } from "./odds";
import { registerHealthRoutes } from "./routes/health";
import { registerProfileRoutes } from "./routes/profiles";
import { registerGameRoutes } from "./routes/games";



/**
 * Camera-ready “hit” contract.
 * We keep this server-local for now so the UI can stay unchanged.
 */
type DartHit = {
  segment: number;
  multiplier: Multiplier;
  source: "manual" | "camera";
  timestamp: number; // epoch ms
};

// Allows old clients to omit source/timestamp.
const dartHitSchema = z.object({
  segment: z.number().int().min(0).max(25),
  multiplier: z.enum([
    "single_inner",
    "single_outer",
    "double",
    "triple",
    "inner_bull",
    "outer_bull",
    "miss",
  ]),
  source: z.enum(["manual", "camera"]).optional(),
  timestamp: z.number().int().positive().optional(),
});

function buildDartHit(input: unknown): DartHit {
  const parsed = dartHitSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid dart hit payload");
  return {
    segment: parsed.data.segment,
    multiplier: parsed.data.multiplier,
    source: parsed.data.source ?? "manual",
    timestamp: parsed.data.timestamp ?? Date.now(),
  };
}

// Helper to map multiplier string to ring and numeric multiplier
function getDartDetails(multiplier: Multiplier): { ring: string; numericMultiplier: number | null } {
  switch (multiplier) {
    case "single_inner":
      return { ring: "single_inner", numericMultiplier: 1 };
    case "single_outer":
      return { ring: "single_outer", numericMultiplier: 1 };
    case "double":
      return { ring: "double", numericMultiplier: 2 };
    case "triple":
      return { ring: "triple", numericMultiplier: 3 };
    case "inner_bull":
      return { ring: "inner_bull", numericMultiplier: 1 };
    case "outer_bull":
      return { ring: "outer_bull", numericMultiplier: 1 };
    case "miss":
      return { ring: "miss", numericMultiplier: null };
    default:
      return { ring: "miss", numericMultiplier: null };
  }
}

// Get hit type from multiplier
function getHitType(multiplier: Multiplier, _segment: number): string {
  if (multiplier === "miss") return "miss";
  if (multiplier === "inner_bull") return "inner_bull";
  if (multiplier === "outer_bull") return "outer_bull";
  return "number";
}

// Get numberHit value (null for miss, 25 for bulls, segment for numbers)
function getNumberHit(multiplier: Multiplier, segment: number): number | null {
  if (multiplier === "miss") return null;
  if (multiplier === "inner_bull" || multiplier === "outer_bull") return 25;
  return segment;
}

/**
 * Server-side choke point for “dart landed” events.
 *
 * Phase 1 (safe): only handles conversion attempts.
 * Everything else falls back to existing behavior in the route handler.
 */
async function applyDartHitToGame(args: {
  game: any;
  currentDrive: any | null;
  events: any[];
  action: string; // legacy: "dart" | "fg" | "punt" | "conversion"
  hit: DartHit;
  storage: any;
}) {
  const { game, currentDrive, events, action, hit, storage } = args;

  // Only handle dart-like actions here for now.
  if (action !== "dart" && action !== "conversion") {
    throw new Error("Unsupported action for dart hit choke point");
  }

  const playerId = game.possession === 1 ? game.player1Id : game.player2Id;

  const lastEvent = events[events.length - 1];
  const isConversion = lastEvent?.type === "conversion_choice";

  const dartResult = calculateDartYards(hit.segment, hit.multiplier);
  const { ring, numericMultiplier } = getDartDetails(hit.multiplier);
  const hitType = getHitType(hit.multiplier, hit.segment);

  if (!isConversion) {
    // Phase 1: do not change offense logic yet.
    return null;
  }

  // ---- conversion attempt logic (moved into choke point; behavior unchanged) ----
  const conversionType = (lastEvent.data as any)?.type;
  let success = false;
  let points = 0;

  if (conversionType === "pat") {
    const patTargets = [1, 5, 20];
    success = hit.multiplier !== "miss" && patTargets.includes(hit.segment);
    points = success ? 1 : 0;
  } else {
    success = hit.segment === 2 && hit.multiplier !== "miss";
    points = success ? 2 : 0;
  }

  if (success) {
    const scoreField = game.possession === 1 ? "player1Score" : "player2Score";
    await storage.updateGame(game.id, {
      [scoreField]: (game.possession === 1 ? game.player1Score : game.player2Score) + points,
    });
  }

  // Record conversion dart throw
  if (currentDrive) {
    const existingThrows = await storage.getDartThrows(currentDrive.id);
    const dartThrow: InsertDartThrow = {
      gameId: game.id,
      driveId: currentDrive.id,
      playerId,
      throwIndex: existingThrows.length + 1,
      phase: conversionType === "pat" ? "conversion_pat" : "conversion_two",
      hitType,
      numberHit: getNumberHit(hit.multiplier, hit.segment),
      ring,
      multiplier: numericMultiplier,
      posBefore: 100,
      posAfter: 100,
      dartsRemainingBefore: 1,
      dartsRemainingAfter: 0,
      yardsAwarded: 0,
      pointsAwarded: points,
      isPatGood: conversionType === "pat" ? success : null,
      isTwoGood: conversionType === "two_point" ? success : null,
      rulePath: success
        ? (conversionType === "pat" ? "PAT_GOOD" : "TWO_GOOD")
        : (conversionType === "pat" ? "PAT_MISS" : "TWO_MISS"),
    };
    await storage.createDartThrow(dartThrow);
  }

  await storage.createEvent({
    gameId: game.id,
    driveId: currentDrive?.id,
    playerId,
    type: conversionType === "pat" ? "pat_attempt" : "two_point_attempt",
    data: { ...dartResult, success, points },
    description: success
      ? `${conversionType === "pat" ? "PAT" : "2-point conversion"} GOOD! +${points}`
      : `${conversionType === "pat" ? "PAT" : "2-point conversion"} failed.`,
  });

  if (currentDrive) {
    await storage.updateDrive(currentDrive.id, {
      result: "td",
      endPosition: 100,
      endedAt: new Date(),
    });
  }

  await handleDriveEnd(game, storage);

  return {
    success: true,
    patMade: conversionType === "pat" && success,
    patMissed: conversionType === "pat" && !success,
    twoPointMade: conversionType === "two_point" && success,
    twoPointMissed: conversionType === "two_point" && !success,
  };
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
 
  registerHealthRoutes(app);
  registerProfileRoutes(app);
  registerGameRoutes(app);

  // ============ MATCHUP LINES (ODDS) ============

  app.get("/api/matchup-line/:profileAId/:profileBId/:firstPossessionId", async (req, res) => {
    try {
      const { profileAId, profileBId, firstPossessionId } = req.params;

      const line = await getMatchupLine(profileAId, profileBId, firstPossessionId);
      res.json(line);
    } catch (error) {
      console.error("Error calculating matchup line:", error);
      res.status(500).json({ error: "Failed to calculate matchup line" });
    }
  });

  // ============ GAMES ============

  

  app.post("/api/games/:id/action", async (req, res) => {
    try {
      const game = await storage.getGame(req.params.id);
      if (!game || game.status === "completed") {
        return res.status(400).json({ error: "Cannot perform action" });
      }

      const { action } = req.body;
      const hit = buildDartHit(req.body);

      const segment = hit.segment;
      const multiplier = hit.multiplier;

      const currentDrive = await storage.getCurrentDrive(game.id);
      const events = await storage.getEvents(game.id);

      const playerId = game.possession === 1 ? game.player1Id : game.player2Id;

      // Choke point: conversion attempts are now handled here (camera-ready)
      try {
        const result = await applyDartHitToGame({
          game,
          currentDrive,
          events,
          action,
          hit,
          storage,
        });

        if (result) {
          res.json(result);
          return;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "Invalid dart hit payload") {
          return res.status(400).json({ error: msg });
        }
        if (msg === "No active drive") {
          return res.status(400).json({ error: msg });
        }
        // Unsupported action just falls through to existing FG/punt/offense logic below.
      }

      const dartResult = calculateDartYards(segment, multiplier as Multiplier);
      const { ring, numericMultiplier } = getDartDetails(multiplier as Multiplier);
      const hitType = getHitType(multiplier as Multiplier, segment);

      if (!currentDrive) {
        return res.status(400).json({ error: "No active drive" });
      }

      const existingThrows = await storage.getDartThrows(currentDrive.id);
      const throwIndex = existingThrows.length + 1;
      const posBefore = currentDrive.currentPosition;
      const requiredDistanceBefore = 100 - posBefore;
      const dartsRemainingBefore = 4 - currentDrive.dartCount;

      if (action === "fg") {
        const target = getFGTarget(currentDrive.currentPosition);
        if (!target) {
          return res.status(400).json({ error: "Not in FG range" });
        }

        const inRange = isValidFGSegment(segment, target);
        const isNotMiss = multiplier !== "miss";
        // Any hit (single, double, triple) on target segments counts as a make
        const isMake = inRange && isNotMiss;
        const points = isMake ? 3 : 0;

        if (isMake) {
          const scoreField = game.possession === 1 ? "player1Score" : "player2Score";
          await storage.updateGame(game.id, {
            [scoreField]: (game.possession === 1 ? game.player1Score : game.player2Score) + 3,
          });
        }

        const missedFGStartPosition = 100 - currentDrive.currentPosition;

        // Record FG dart throw
        const dartThrow: InsertDartThrow = {
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          throwIndex,
          phase: "field_goal",
          hitType,
          numberHit: getNumberHit(multiplier as Multiplier, segment),
          ring,
          multiplier: numericMultiplier,
          posBefore,
          posAfter: posBefore,
          requiredDistanceBefore,
          requiredDistanceAfter: requiredDistanceBefore,
          dartsRemainingBefore,
          dartsRemainingAfter: dartsRemainingBefore - 1,
          yardsAwarded: 0,
          pointsAwarded: points,
          isFgAttempt: true,
          isFgGood: isMake,
          rulePath: isMake ? `FG_GOOD_${100 - posBefore <= 39 ? "0_39" : "40_50"}` : "FG_MISS",
        };
        await storage.createDartThrow(dartThrow);

        await storage.updateDrive(currentDrive.id, {
          result: isMake ? "fg_make" : "fg_miss",
          pointsScored: points,
          endPosition: currentDrive.currentPosition,
          endedAt: new Date(),
        });

        await storage.createEvent({
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          type: "fg_attempt",
          data: {
            ...dartResult,
            target: target.description,
            made: isMake,
            missedFGSpot: isMake ? null : missedFGStartPosition,
          },
          description: isMake
            ? `FIELD GOAL GOOD! (needed ${target.description})`
            : `Field goal MISSED. (needed ${target.description}) Opponent takes over at ${formatFieldPosition(missedFGStartPosition)}.`,
        });

        await handleDriveEnd(game, storage, isMake ? 30 : missedFGStartPosition, isMake ? "default_own_30" : "missed_fg_spot");
        res.json({ success: true, fgMade: isMake, fgMissed: !isMake });
        return;
      }

      if (action === "punt") {
        const puntResult = calculatePuntResult(dartResult, currentDrive.currentPosition);
        const isBlockedPunt = multiplier === "miss";

        // Apply penalty if punting from inside own 30 - reduced punt effectiveness
        // But NOT for blocked punts - those use the flipped position directly
        const puntingPosition = currentDrive.currentPosition;
        const insideOwn30Penalty = !isBlockedPunt && puntingPosition < 30 ? 30 - puntingPosition : 0;

        // Only cap at 50 when there's a penalty applied, not for blocked punts
        let adjustedReceivingPosition = puntResult.receivingPosition + insideOwn30Penalty;
        if (insideOwn30Penalty > 0) {
          adjustedReceivingPosition = Math.min(adjustedReceivingPosition, 50);
        }

        let puntDescription = puntResult.description;
        if (insideOwn30Penalty > 0) {
          puntDescription = `${puntResult.description} (Punting from own ${puntingPosition}: -${insideOwn30Penalty} yards penalty, opponent starts at ${formatFieldPosition(
            adjustedReceivingPosition
          )})`;
        }

        // Record punt dart throw
        const dartThrow: InsertDartThrow = {
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          throwIndex,
          phase: "punt",
          hitType,
          numberHit: getNumberHit(multiplier as Multiplier, segment),
          ring,
          multiplier: numericMultiplier,
          posBefore,
          posAfter: posBefore,
          requiredDistanceBefore,
          requiredDistanceAfter: requiredDistanceBefore,
          dartsRemainingBefore,
          dartsRemainingAfter: 0,
          yardsAwarded: 0,
          pointsAwarded: 0,
          isPunt: true,
          isPuntBlocked: multiplier === "miss",
          puntNextStartPos: adjustedReceivingPosition,
          puntReturnYards: puntResult.returnYards,
          rulePath: multiplier === "miss" ? "PUNT_BLOCKED" : `PUNT_${multiplier.toUpperCase()}`,
        };
        await storage.createDartThrow(dartThrow);

        await storage.updateDrive(currentDrive.id, {
          result: "punt",
          endPosition: currentDrive.currentPosition,
          endedAt: new Date(),
        });

        await storage.createEvent({
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          type: "punt",
          data: {
            ...dartResult,
            ...puntResult,
            receivingPosition: adjustedReceivingPosition,
            insideOwn30Penalty,
            originalReceivingPosition: puntResult.receivingPosition,
          },
          description: `Punt: ${puntDescription}`,
        });

        await handleDriveEnd(game, storage, adjustedReceivingPosition, "punt_result");
        res.json({ success: true });
        return;
      }

      // Regular dart throw

      // PENALTY: Missing the board moves you back 10 yards
      if (multiplier === "miss") {
        const penaltyYards = 10;
        const positionAfterPenalty = currentDrive.currentPosition - penaltyYards;

        // Safety check - if penalty pushes past own goal line
        if (positionAfterPenalty <= 0) {
          const dartThrow: InsertDartThrow = {
            gameId: game.id,
            driveId: currentDrive.id,
            playerId,
            throwIndex,
            phase: "offense",
            hitType: "miss",
            numberHit: null,
            ring: "miss",
            multiplier: null,
            posBefore,
            posAfter: 0,
            requiredDistanceBefore,
            requiredDistanceAfter: 100,
            dartsRemainingBefore,
            dartsRemainingAfter: dartsRemainingBefore - 1,
            yardsAwarded: -penaltyYards,
            pointsAwarded: -2, // Opponent gets 2 points
            isSafety: true,
            rulePath: "PENALTY_SAFETY",
          };
          await storage.createDartThrow(dartThrow);

          await storage.updateDrive(currentDrive.id, {
            dartCount: currentDrive.dartCount + 1,
            yardsGained: currentDrive.yardsGained - penaltyYards,
            currentPosition: 0,
            result: "safety",
            endPosition: 0,
            endedAt: new Date(),
          });

          // Award 2 points to opponent
          const opponentScoreField = game.possession === 1 ? "player2Score" : "player1Score";
          const opponentCurrentScore = game.possession === 1 ? game.player2Score : game.player1Score;
          await storage.updateGame(game.id, {
            [opponentScoreField]: opponentCurrentScore + 2,
          });

          await storage.createEvent({
            gameId: game.id,
            driveId: currentDrive.id,
            playerId,
            type: "dart",
            data: { ...dartResult, penalty: true, penaltyYards },
            description: `MISSED BOARD! 10-yard penalty.`,
          });

          await storage.createEvent({
            gameId: game.id,
            driveId: currentDrive.id,
            playerId,
            type: "safety",
            data: {},
            description: `SAFETY! Penalty pushed offense past their own goal line. Opponent gets 2 points.`,
          });

          // After safety, opponent gets ball at their own 20
          await handleDriveEnd(game, storage, 20, "safety_free_kick");
          res.json({ success: true, safety: true });
          return;
        }

        // Normal penalty - move back 10 yards, continue drive
        const dartThrow: InsertDartThrow = {
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          throwIndex,
          phase: "offense",
          hitType: "miss",
          numberHit: null,
          ring: "miss",
          multiplier: null,
          posBefore,
          posAfter: positionAfterPenalty,
          requiredDistanceBefore,
          requiredDistanceAfter: 100 - positionAfterPenalty,
          dartsRemainingBefore,
          dartsRemainingAfter: dartsRemainingBefore - 1,
          yardsAwarded: -penaltyYards,
          pointsAwarded: 0,
          isPenalty: true,
          rulePath: "PENALTY_MISS",
        };
        await storage.createDartThrow(dartThrow);

        const newDartCount = currentDrive.dartCount + 1;
        await storage.updateDrive(currentDrive.id, {
          dartCount: newDartCount,
          yardsGained: currentDrive.yardsGained - penaltyYards,
          currentPosition: positionAfterPenalty,
        });

        await storage.createEvent({
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          type: "dart",
          data: { ...dartResult, penalty: true, penaltyYards },
          description: `MISSED BOARD! 10-yard penalty. Now at ${formatFieldPosition(positionAfterPenalty)}`,
        });

        // Check if 4 darts used after penalty
        if (newDartCount >= 4) {
          await storage.updateDrive(currentDrive.id, {
            result: "turnover_on_downs",
            endPosition: positionAfterPenalty,
            endedAt: new Date(),
          });

          await storage.createEvent({
            gameId: game.id,
            driveId: currentDrive.id,
            playerId,
            type: "turnover",
            data: { reason: "downs", receivingPosition: 100 - positionAfterPenalty },
            description: `Turnover on downs! Opponent takes over at ${formatFieldPosition(100 - positionAfterPenalty)}.`,
          });

          // Opponent takes over at the spot (flipped)
          await handleDriveEnd(game, storage, 100 - positionAfterPenalty, "turnover_on_downs");
          res.json({ success: true, penalty: true, turnover: true });
          return;
        }

        res.json({ success: true, penalty: true });
        return;
      }

      const newPosition = Math.min(currentDrive.currentPosition + dartResult.yards, 100);
      const requiredDistance = 100 - currentDrive.startPosition;
      const totalYards = currentDrive.yardsGained + dartResult.yards;

      // Inner bull = automatic TD
      if (dartResult.isInnerBull) {
        const dartThrow: InsertDartThrow = {
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          throwIndex,
          phase: "offense",
          hitType: "inner_bull",
          numberHit: 25,
          ring: "inner_bull",
          multiplier: 1,
          posBefore,
          posAfter: 100,
          requiredDistanceBefore,
          requiredDistanceAfter: 0,
          dartsRemainingBefore,
          dartsRemainingAfter: dartsRemainingBefore - 1,
          yardsAwarded: 100 - posBefore,
          pointsAwarded: 6,
          isTd: true,
          rulePath: "TD_INNER_BULL",
        };
        await storage.createDartThrow(dartThrow);

        await storage.updateDrive(currentDrive.id, {
          dartCount: currentDrive.dartCount + 1,
          yardsGained: 100 - currentDrive.startPosition,
          currentPosition: 100,
          result: "td",
          pointsScored: 6,
          endPosition: 100,
        });

        const scoreField = game.possession === 1 ? "player1Score" : "player2Score";
        await storage.updateGame(game.id, {
          [scoreField]: (game.possession === 1 ? game.player1Score : game.player2Score) + 6,
        });

        await storage.createEvent({
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          type: "dart",
          data: { ...dartResult },
          description: `Inner Bull! Automatic touchdown!`,
        });

        await storage.createEvent({
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          type: "touchdown",
          data: { innerBull: true },
          description: `TOUCHDOWN! (Inner Bull)`,
        });

        res.json({ success: true, touchdown: true });
        return;
      }

      // Check for interception: D1, T1, D3, T3
      const isInterception = (segment === 1 || segment === 3) && (multiplier === "double" || multiplier === "triple");

      if (isInterception) {
        const dartThrow: InsertDartThrow = {
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          throwIndex,
          phase: "offense",
          hitType,
          numberHit: getNumberHit(multiplier as Multiplier, segment),
          ring,
          multiplier: numericMultiplier,
          posBefore,
          posAfter: posBefore,
          requiredDistanceBefore,
          requiredDistanceAfter: requiredDistanceBefore,
          dartsRemainingBefore,
          dartsRemainingAfter: 0,
          yardsAwarded: 0,
          pointsAwarded: 0,
          isInterception: true,
          rulePath: "INTERCEPTION",
        };
        await storage.createDartThrow(dartThrow);

        await storage.updateDrive(currentDrive.id, {
          dartCount: currentDrive.dartCount + 1,
          result: "interception",
          endPosition: currentDrive.currentPosition,
          endedAt: new Date(),
        });

        await storage.createEvent({
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          type: "dart",
          data: { ...dartResult },
          description: `${formatDartResult(dartResult)}`,
        });

        // Opponent takes over at the spot (flipped)
        const opponentStartPosition = 100 - currentDrive.currentPosition;

        await storage.createEvent({
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          type: "interception",
          data: { segment, multiplier, receivingPosition: opponentStartPosition },
          description: `INTERCEPTION! ${formatDartResult(dartResult)} - Turnover at ${formatFieldPosition(
            currentDrive.currentPosition
          )}. Opponent takes over at ${formatFieldPosition(opponentStartPosition)}.`,
        });
        await handleDriveEnd(game, storage, opponentStartPosition, "interception");
        res.json({ success: true, interception: true });
        return;
      }

      // Check for exact TD
      if (newPosition >= 100 && totalYards === requiredDistance) {
        const dartThrow: InsertDartThrow = {
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          throwIndex,
          phase: "offense",
          hitType,
          numberHit: getNumberHit(multiplier as Multiplier, segment),
          ring,
          multiplier: numericMultiplier,
          posBefore,
          posAfter: 100,
          requiredDistanceBefore,
          requiredDistanceAfter: 0,
          dartsRemainingBefore,
          dartsRemainingAfter: dartsRemainingBefore - 1,
          yardsAwarded: dartResult.yards,
          pointsAwarded: 6,
          isTd: true,
          rulePath: "TD_EXACT",
        };
        await storage.createDartThrow(dartThrow);

        await storage.updateDrive(currentDrive.id, {
          dartCount: currentDrive.dartCount + 1,
          yardsGained: totalYards,
          currentPosition: 100,
          result: "td",
          pointsScored: 6,
          endPosition: 100,
        });

        const scoreField = game.possession === 1 ? "player1Score" : "player2Score";
        await storage.updateGame(game.id, {
          [scoreField]: (game.possession === 1 ? game.player1Score : game.player2Score) + 6,
        });

        await storage.createEvent({
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          type: "dart",
          data: { ...dartResult },
          description: `${formatDartResult(dartResult)} - ${dartResult.yards} yards`,
        });

        await storage.createEvent({
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          type: "touchdown",
          data: { innerBull: false },
          description: `TOUCHDOWN! Reached the end zone exactly.`,
        });

        res.json({ success: true, touchdown: true });
        return;
      }

      // Check for bust (overshot)
      if (totalYards > requiredDistance) {
        const dartThrow: InsertDartThrow = {
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          throwIndex,
          phase: "offense",
          hitType,
          numberHit: getNumberHit(multiplier as Multiplier, segment),
          ring,
          multiplier: numericMultiplier,
          posBefore,
          posAfter: newPosition,
          requiredDistanceBefore,
          requiredDistanceAfter: 100 - newPosition,
          dartsRemainingBefore,
          dartsRemainingAfter: dartsRemainingBefore - 1,
          yardsAwarded: dartResult.yards,
          pointsAwarded: 0,
          isBust: true,
          rulePath: "BUST_OVERSHOOT",
        };
        await storage.createDartThrow(dartThrow);

        await storage.updateDrive(currentDrive.id, {
          dartCount: currentDrive.dartCount + 1,
          yardsGained: totalYards,
          currentPosition: newPosition,
          result: "bust",
          endPosition: newPosition,
          endedAt: new Date(),
        });

        await storage.createEvent({
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          type: "dart",
          data: { ...dartResult },
          description: `${formatDartResult(dartResult)} - ${dartResult.yards} yards`,
        });

        await storage.createEvent({
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          type: "bust",
          data: { overshoot: totalYards - requiredDistance },
          description: `BUST! Overshot by ${totalYards - requiredDistance} yards.`,
        });

        await handleDriveEnd(game, storage);
        res.json({ success: true, bust: true });
        return;
      }

      // Normal dart advance
      const dartThrow: InsertDartThrow = {
        gameId: game.id,
        driveId: currentDrive.id,
        playerId,
        throwIndex,
        phase: "offense",
        hitType,
        numberHit: getNumberHit(multiplier as Multiplier, segment),
        ring,
        multiplier: numericMultiplier,
        posBefore,
        posAfter: newPosition,
        requiredDistanceBefore,
        requiredDistanceAfter: 100 - newPosition,
        dartsRemainingBefore,
        dartsRemainingAfter: dartsRemainingBefore - 1,
        yardsAwarded: dartResult.yards,
        pointsAwarded: 0,
        rulePath: "ADVANCE",
      };
      await storage.createDartThrow(dartThrow);

      const newDartCount = currentDrive.dartCount + 1;
      await storage.updateDrive(currentDrive.id, {
        dartCount: newDartCount,
        yardsGained: totalYards,
        currentPosition: newPosition,
      });

      await storage.createEvent({
        gameId: game.id,
        driveId: currentDrive.id,
        playerId,
        type: "dart",
        data: { ...dartResult },
        description: `${formatDartResult(dartResult)} - ${dartResult.yards} yards. Now at ${formatFieldPosition(newPosition)}`,
      });

      // Check if 4 darts used
      if (newDartCount >= 4) {
        const remainingDistance = 100 - newPosition;
        const originalRemaining = 100 - currentDrive.currentPosition;

        if (remainingDistance === 1 && originalRemaining >= 21 && originalRemaining <= 50) {
          await storage.createEvent({
            gameId: game.id,
            driveId: currentDrive.id,
            playerId,
            type: "dart",
            data: { bonusDartEarned: true },
            description: `At the 1-yard line! Bonus dart earned - must hit Single 1 for TD`,
          });
        } else {
          // Turnover on downs - opponent takes over at the spot
          await storage.updateDrive(currentDrive.id, {
            result: "turnover_on_downs",
            endPosition: newPosition,
            endedAt: new Date(),
          });

          await storage.createEvent({
            gameId: game.id,
            driveId: currentDrive.id,
            playerId,
            type: "turnover",
            data: { reason: "downs", receivingPosition: 100 - newPosition },
            description: `Turnover on downs! Opponent takes over at ${formatFieldPosition(100 - newPosition)}.`,
          });

          // Opponent takes over at the flipped spot
          await handleDriveEnd(game, storage, 100 - newPosition, "turnover_on_downs");
          res.json({ success: true, turnover: true });
          return;
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error performing action:", error);
      res.status(500).json({ error: "Failed to perform action" });
    }
  });

  // Bonus dart (4th-dart cushion rule)
  app.post("/api/games/:id/bonus-dart", async (req, res) => {
    try {
      const game = await storage.getGame(req.params.id);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      const currentDrive = await storage.getCurrentDrive(game.id);
      if (!currentDrive) {
        return res.status(400).json({ error: "No active drive" });
      }

      const { segment, multiplier } = req.body;
      const dartData = calculateDartYards(segment, multiplier);
      const dartResult = {
        segment,
        multiplier,
        yards: dartData.yards,
        isInnerBull: multiplier === "inner_bull",
        isOuterBull: multiplier === "outer_bull",
      };

      const { ring, numericMultiplier } = getDartDetails(multiplier as Multiplier);
      const hitType = getHitType(multiplier as Multiplier, segment);
      const playerId = currentDrive.playerId;

      const existingThrows = await storage.getDartThrows(currentDrive.id);
      const throwIndex = existingThrows.length + 1;

      const isSingle1 = (multiplier === "single_inner" || multiplier === "single_outer") && segment === 1;

      if (isSingle1) {
        const dartThrow: InsertDartThrow = {
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          throwIndex,
          phase: "bonus_one_yard_cushion",
          hitType,
          numberHit: 1,
          ring,
          multiplier: numericMultiplier,
          posBefore: 99,
          posAfter: 100,
          requiredDistanceBefore: 1,
          requiredDistanceAfter: 0,
          dartsRemainingBefore: 1,
          dartsRemainingAfter: 0,
          yardsAwarded: 1,
          pointsAwarded: 6,
          isTd: true,
          rulePath: "TD_BONUS_DART",
        };
        await storage.createDartThrow(dartThrow);

        await storage.updateDrive(currentDrive.id, {
          result: "td",
          currentPosition: 100,
          pointsScored: 6,
          endPosition: 100,
        });

        if (playerId === game.player1Id) {
          await storage.updateGame(game.id, { player1Score: game.player1Score + 6 });
        } else {
          await storage.updateGame(game.id, { player2Score: game.player2Score + 6 });
        }

        await storage.createEvent({
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          type: "dart",
          data: { ...dartResult, bonusDart: true },
          description: `Bonus dart: ${formatDartResult(dartResult)}`,
        });

        await storage.createEvent({
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          type: "touchdown",
          data: { bonusDart: true },
          description: `TOUCHDOWN! (Bonus dart Single 1)`,
        });

        res.json({ success: true, touchdown: true });
      } else {
        const dartThrow: InsertDartThrow = {
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          throwIndex,
          phase: "bonus_one_yard_cushion",
          hitType,
          numberHit: getNumberHit(multiplier as Multiplier, segment),
          ring,
          multiplier: numericMultiplier,
          posBefore: 99,
          posAfter: 99,
          requiredDistanceBefore: 1,
          requiredDistanceAfter: 1,
          dartsRemainingBefore: 1,
          dartsRemainingAfter: 0,
          yardsAwarded: 0,
          pointsAwarded: 0,
          isBust: true,
          rulePath: "BONUS_DART_MISS",
        };
        await storage.createDartThrow(dartThrow);

        await storage.updateDrive(currentDrive.id, {
          result: "bust",
          endPosition: 99,
          endedAt: new Date(),
        });

        await storage.createEvent({
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          type: "dart",
          data: { ...dartResult, bonusDart: true },
          description: `Bonus dart: ${formatDartResult(dartResult)} - Needed Single 1`,
        });

        await storage.createEvent({
          gameId: game.id,
          driveId: currentDrive.id,
          playerId,
          type: "bust",
          data: { bonusDartMissed: true },
          description: `Bonus dart missed! Drive ends.`,
        });

        await handleDriveEnd(game, storage);

        res.json({ success: true, touchdown: false });
      }
    } catch (error) {
      console.error("Error applying bonus dart:", error);
      res.status(500).json({ error: "Failed to apply bonus dart" });
    }
  });

  // Undo last action
  app.post("/api/games/:id/undo", async (req, res) => {
    try {
      const game = await storage.getGame(req.params.id);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      const events = await storage.getEvents(game.id);
      if (events.length === 0) {
        return res.json({ success: false });
      }

      const lastEvent = events[events.length - 1];

      const deleted = await storage.deleteLastEvent(req.params.id);
      if (!deleted) {
        return res.json({ success: false });
      }

      if (lastEvent.type === "dart" && lastEvent.driveId) {
        // Also delete the last dart throw
        await storage.deleteLastDartThrow(lastEvent.driveId);

        const currentDrive = await storage.getDrive(lastEvent.driveId);
        if (currentDrive) {
          const remainingEvents = events.filter(
            (e) =>
              e.driveId === lastEvent.driveId &&
              e.type === "dart" &&
              e.id !== lastEvent.id &&
              e.data &&
              typeof e.data === "object" &&
              "yards" in e.data
          );

          let yardsGained = 0;
          for (const event of remainingEvents) {
            const data = event.data as Record<string, unknown>;
            if (typeof data.yards === "number") {
              yardsGained += data.yards;
            }
          }

          const newPosition = currentDrive.startPosition + yardsGained;
          await storage.updateDrive(currentDrive.id, {
            dartCount: remainingEvents.length,
            yardsGained,
            currentPosition: newPosition,
            result: null,
            pointsScored: 0,
            endPosition: null,
            endedAt: null,
          });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error undoing action:", error);
      res.status(500).json({ error: "Failed to undo" });
    }
  });

  return httpServer;
}

const DRIVES_PER_PLAYER_PER_QUARTER = 2;

async function handleDriveEnd(game: any, storage: any, nextDriveStartPosition: number = 30, nextDriveStartReason: string = "default_own_30") {
  const drives = await storage.getDrives(game.id);
  const updatedGame = await storage.getGame(game.id);
  const newPossession = game.possession === 1 ? 2 : 1;

  // Handle overtime (quarter 5+)
  // Each player gets 2 drives per OT period (currentQuarter tracks the period: Q5 = OT1, Q6 = OT2, etc.)
  if (game.status === "overtime" || game.currentQuarter >= 5) {
    const DRIVES_PER_PLAYER_PER_OT = 2;
    const currentOTPeriod = game.currentQuarter; // Q5 = OT period 1, Q6 = OT period 2, etc.

    // Count drives in current OT period only
    const currentPeriodDrives = drives.filter((d: any) => d.quarter === currentOTPeriod && d.result !== null);
    const player1OTDrives = currentPeriodDrives.filter((d: any) => d.playerId === game.player1Id).length;
    const player2OTDrives = currentPeriodDrives.filter((d: any) => d.playerId === game.player2Id).length;

    // Check if both players have completed 2 drives in this OT period
    const bothCompletedPeriod = player1OTDrives >= DRIVES_PER_PLAYER_PER_OT && player2OTDrives >= DRIVES_PER_PLAYER_PER_OT;

    if (bothCompletedPeriod) {
      // If scores differ, game is over - leader wins
      if (updatedGame.player1Score !== updatedGame.player2Score) {
        const winnerId = updatedGame.player1Score > updatedGame.player2Score ? game.player1Id : game.player2Id;

        await storage.updateGame(game.id, {
          status: "completed",
          winnerId,
          completedAt: new Date(),
        });

        await storage.createEvent({
          gameId: game.id,
          playerId: winnerId,
          type: "game_end",
          data: {
            player1Score: updatedGame.player1Score,
            player2Score: updatedGame.player2Score,
            winnerId,
            overtime: true,
          },
          description: `OT Game Over! Final: ${updatedGame.player1Score} - ${updatedGame.player2Score}`,
        });
        return;
      }

      // Still tied after both completed 2 drives - start new OT period
      // Same player goes first (whoever won coin flip), no new coin flip
      const nextOTPeriod = currentOTPeriod + 1;
      const otFirstPossession = game.firstPossession; // Use the OT coin flip winner (stored as firstPossession after OT coin flip)

      await storage.updateGame(game.id, {
        currentQuarter: nextOTPeriod,
        possession: otFirstPossession,
      });

      await storage.createEvent({
        gameId: game.id,
        playerId: otFirstPossession === 1 ? game.player1Id : game.player2Id,
        type: "overtime_start",
        data: { period: nextOTPeriod - 4 },
        description: `Overtime Period ${nextOTPeriod - 4} - Still tied!`,
      });
      return;
    }

    // Switch possession and set next drive start position (typically own 30 unless specified otherwise)
    const startPos = nextDriveStartReason === "default_own_30" ? 30 : nextDriveStartPosition;
    await storage.updateGame(game.id, {
      possession: newPossession,
    });

    await storage.createEvent({
      gameId: game.id,
      playerId: newPossession === 1 ? game.player1Id : game.player2Id,
      type: "ot_drive_change",
      data: {
        possession: newPossession,
        startPosition: startPos,
        startReason: nextDriveStartReason,
        drivesCompleted: { player1: player1OTDrives, player2: player2OTDrives },
      },
      description: `OT possession change (${player1OTDrives + player2OTDrives + 1}/4 drives)`,
    });
    return;
  }

  // Normal quarters 1-4
  const currentQuarterDrives = drives.filter((d: any) => d.quarter === game.currentQuarter);
  const player1Drives = currentQuarterDrives.filter((d: any) => d.playerId === game.player1Id && d.result !== null).length;
  const player2Drives = currentQuarterDrives.filter((d: any) => d.playerId === game.player2Id && d.result !== null).length;

  if (player1Drives >= DRIVES_PER_PLAYER_PER_QUARTER && player2Drives >= DRIVES_PER_PLAYER_PER_QUARTER) {
    const nextQuarter = game.currentQuarter + 1;

    if (nextQuarter > 4) {
      if (updatedGame.player1Score === updatedGame.player2Score) {
        await storage.updateGame(game.id, {
          currentQuarter: 5,
          status: "awaiting_ot_coin_flip",
        });

        await storage.createEvent({
          gameId: game.id,
          playerId: game.possession === 1 ? game.player1Id : game.player2Id,
          type: "overtime_start",
          data: { awaitingCoinFlip: true },
          description: "Overtime! Coin flip to determine first possession.",
        });
      } else {
        const winnerId = updatedGame.player1Score > updatedGame.player2Score ? game.player1Id : game.player2Id;

        await storage.updateGame(game.id, {
          status: "completed",
          winnerId,
          completedAt: new Date(),
        });

        await storage.createEvent({
          gameId: game.id,
          playerId: winnerId,
          type: "game_end",
          data: {
            player1Score: updatedGame.player1Score,
            player2Score: updatedGame.player2Score,
            winnerId,
          },
          description: `Game Over! Final: ${updatedGame.player1Score} - ${updatedGame.player2Score}`,
        });
      }
    } else {
      let nextPossession = newPossession;
      if (nextQuarter === 3 && game.firstPossession !== undefined) {
        nextPossession = game.firstPossession === 1 ? 2 : 1;
      }

      await storage.updateGame(game.id, {
        currentQuarter: nextQuarter,
        possession: nextPossession,
      });

      await storage.createEvent({
        gameId: game.id,
        playerId: game.possession === 1 ? game.player1Id : game.player2Id,
        type: "quarter_end",
        data: { quarter: game.currentQuarter },
        description: `Quarter ${game.currentQuarter} ended`,
      });
    }
  } else {
    await storage.updateGame(game.id, { possession: newPossession });
  }
}

function formatDartResult(dart: DartResult): string {
  if (dart.multiplier === "miss") return "Miss";
  if (dart.isInnerBull) return "Inner Bull";
  if (dart.isOuterBull) return "Outer Bull (25)";

  const prefix = dart.multiplier === "triple" ? "T" : dart.multiplier === "double" ? "D" : "S";

  return `${prefix}${dart.segment}`;
}
