// server/routes/darts.ts
import type { Express } from "express";

import { type InsertDartThrow } from "@shared/schema";

import {
  calculateDartYards,
  formatFieldPosition,
  getFGTarget,
  calculatePuntResult,
  isValidFGSegment,
} from "@shared/engine/engine";
import type { Multiplier } from "@shared/engine/types";

// Server-local helpers moved out of routes.ts
import {
  buildDartHit,
  applyDartHitToGame,
  getDartDetails,
  getHitType,
  getNumberHit,
  handleDriveEnd,
  formatDartResult,
} from "./darts.helpers";

export function registerDartRoutes(app: Express, storage: typeof import("../storage").storage) {
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
            : `Field goal MISSED. (needed ${target.description}) Opponent takes over at ${formatFieldPosition(
                missedFGStartPosition
              )}.`,
        });

        await handleDriveEnd(
          game,
          storage,
          isMake ? 30 : missedFGStartPosition,
          isMake ? "default_own_30" : "missed_fg_spot"
        );
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
            description: `Turnover on downs! Opponent takes over at ${formatFieldPosition(
              100 - positionAfterPenalty
            )}.`,
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
        description: `${formatDartResult(dartResult)} - ${dartResult.yards} yards. Now at ${formatFieldPosition(
          newPosition
        )}`,
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
}
