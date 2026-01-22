// server/routes/darts.helpers.ts

import { z } from "zod";
import { type InsertDartThrow } from "@shared/schema";
import { calculateDartYards } from "@shared/engine/engine";
import type { Multiplier, DartResult } from "@shared/engine/types";

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

export function buildDartHit(input: unknown): DartHit {
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
export function getDartDetails(
  multiplier: Multiplier
): { ring: string; numericMultiplier: number | null } {
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
export function getHitType(multiplier: Multiplier, _segment: number): string {
  if (multiplier === "miss") return "miss";
  if (multiplier === "inner_bull") return "inner_bull";
  if (multiplier === "outer_bull") return "outer_bull";
  return "number";
}

// Get numberHit value (null for miss, 25 for bulls, segment for numbers)
export function getNumberHit(multiplier: Multiplier, segment: number): number | null {
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
export async function applyDartHitToGame(args: {
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
        ? conversionType === "pat"
          ? "PAT_GOOD"
          : "TWO_GOOD"
        : conversionType === "pat"
          ? "PAT_MISS"
          : "TWO_MISS",
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

const DRIVES_PER_PLAYER_PER_QUARTER = 2;

export async function handleDriveEnd(
  game: any,
  storage: any,
  nextDriveStartPosition: number = 30,
  nextDriveStartReason: string = "default_own_30"
) {
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
    const bothCompletedPeriod =
      player1OTDrives >= DRIVES_PER_PLAYER_PER_OT && player2OTDrives >= DRIVES_PER_PLAYER_PER_OT;

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
  const player1Drives = currentQuarterDrives.filter(
    (d: any) => d.playerId === game.player1Id && d.result !== null
  ).length;
  const player2Drives = currentQuarterDrives.filter(
    (d: any) => d.playerId === game.player2Id && d.result !== null
  ).length;

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

export function formatDartResult(dart: DartResult): string {
  if (dart.multiplier === "miss") return "Miss";
  if (dart.isInnerBull) return "Inner Bull";
  if (dart.isOuterBull) return "Outer Bull (25)";

  const prefix = dart.multiplier === "triple" ? "T" : dart.multiplier === "double" ? "D" : "S";
  return `${prefix}${dart.segment}`;
}
