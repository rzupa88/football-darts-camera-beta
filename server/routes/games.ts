// server/routes/games.ts
import type { Express } from "express";
import { storage } from "../storage";
import { insertGameSchema } from "@shared/schema";
import { formatFieldPosition } from "@shared/engine/engine";

// NOTE: This stays here for now to avoid behavior changes while extracting.
// Later we can move it into a shared helper.
function getAvailableActions(
  game: any,
  currentDrive: any,
  awaitingConversion: boolean = false,
  awaitingConversionAttempt: boolean = false,
  awaitingBonusDart: boolean = false
) {
  if (awaitingBonusDart) {
    return {
      canThrowDart: false,
      canAttemptFG: false,
      canPunt: false,
      canChooseConversion: false,
      canAttemptConversion: false,
      canUseBonusDart: true,
    };
  }

  if (awaitingConversionAttempt) {
    return {
      canThrowDart: false,
      canAttemptFG: false,
      canPunt: false,
      canChooseConversion: false,
      canAttemptConversion: true,
      canUseBonusDart: false,
    };
  }

  if (awaitingConversion) {
    return {
      canThrowDart: false,
      canAttemptFG: false,
      canPunt: false,
      canChooseConversion: true,
      canAttemptConversion: false,
      canUseBonusDart: false,
    };
  }

  if (game.status === "completed" || !currentDrive) {
    return {
      canThrowDart: false,
      canAttemptFG: false,
      canPunt: false,
      canChooseConversion: false,
      canAttemptConversion: false,
      canUseBonusDart: false,
    };
  }

  const position = currentDrive.currentPosition;
  const dartCount = currentDrive.dartCount;

  return {
    canThrowDart: dartCount < 4,
    canAttemptFG: position >= 50,
    canPunt: dartCount === 3 && position < 50,
    canChooseConversion: false,
    canAttemptConversion: false,
    canUseBonusDart: false,
  };
}

export function registerGameRoutes(app: Express) {
  // ============ GAMES ============

  app.get("/api/games", async (req, res) => {
    try {
      const games = await storage.getGames();
      res.json(games);
    } catch {
      res.status(500).json({ error: "Failed to fetch games" });
    }
  });

  app.get("/api/games/:id", async (req, res) => {
    try {
      const game = await storage.getGame(req.params.id);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }
      res.json(game);
    } catch {
      res.status(500).json({ error: "Failed to fetch game" });
    }
  });

  app.post("/api/games", async (req, res) => {
    try {
      const parsed = insertGameSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid game data" });
      }

      const game = await storage.createGame(parsed.data);

      const startingPlayerId = game.possession === 1 ? game.player1Id : game.player2Id;
      await storage.createEvent({
        gameId: game.id,
        playerId: startingPlayerId,
        type: "game_start",
        data: { firstPossession: game.possession },
        description: `Game started`,
      });

      res.status(201).json(game);
    } catch {
      res.status(500).json({ error: "Failed to create game" });
    }
  });

  app.get("/api/games/:id/state", async (req, res) => {
    try {
      const game = await storage.getGame(req.params.id);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      const [player1, player2, currentDrive, events, drives] = await Promise.all([
        storage.getProfile(game.player1Id),
        storage.getProfile(game.player2Id),
        storage.getCurrentDrive(game.id),
        storage.getEvents(game.id),
        storage.getDrives(game.id),
      ]);

      const lastEvent = events[events.length - 1];
      const awaitingConversion = lastEvent?.type === "touchdown";

      const lastConversionChoiceIdx = events.map((e) => e.type).lastIndexOf("conversion_choice");
      const hasAttemptAfterChoice =
        lastConversionChoiceIdx >= 0 &&
        events
          .slice(lastConversionChoiceIdx + 1)
          .some((e) => e.type === "pat_attempt" || e.type === "two_point_attempt");
      const awaitingConversionAttempt = lastEvent?.type === "conversion_choice" && !hasAttemptAfterChoice;

      const pendingConversionType = awaitingConversionAttempt
        ? ((lastEvent?.data as Record<string, unknown>)?.type as string)
        : null;

      const awaitingBonusDart = !!(
        lastEvent?.data &&
        typeof lastEvent.data === "object" &&
        "bonusDartEarned" in lastEvent.data &&
        (lastEvent.data as Record<string, unknown>).bonusDartEarned === true
      );

      let pendingStartPosition = 30;

      // Check if this is the first drive after halftime (Q3) - always start at own 30
      const q3Drives = drives.filter((d: any) => d.quarter === 3);
      const isFirstDriveAfterHalftime = game.currentQuarter === 3 && q3Drives.length === 0;

      if (!isFirstDriveAfterHalftime) {
        // Only scan for special positions if not first drive after halftime
        for (let i = events.length - 1; i >= 0; i--) {
          const event = events[i];
          const eventData = event.data as Record<string, unknown> | null;

          if (event.type === "fg_attempt" && eventData?.made === false && eventData?.missedFGSpot) {
            pendingStartPosition = eventData.missedFGSpot as number;
            break;
          }
          if (event.type === "punt" && eventData?.receivingPosition !== undefined) {
            pendingStartPosition = eventData.receivingPosition as number;
            break;
          }
          if (event.type === "turnover" && eventData?.receivingPosition !== undefined) {
            pendingStartPosition = eventData.receivingPosition as number;
            break;
          }
          if (event.type === "interception" && eventData?.receivingPosition !== undefined) {
            pendingStartPosition = eventData.receivingPosition as number;
            break;
          }
          if (event.type === "ot_drive_change" && eventData?.startPosition !== undefined) {
            pendingStartPosition = eventData.startPosition as number;
            break;
          }
          if (event.type === "drive_start") {
            break;
          }
        }
      }

      const availableActions = getAvailableActions(
        game,
        currentDrive,
        awaitingConversion,
        awaitingConversionAttempt,
        awaitingBonusDart
      );

      res.json({
        game,
        currentDrive,
        events,
        drives,
        player1: player1 ?? { id: game.player1Id, name: "Player 1", createdAt: new Date() },
        player2: player2 ?? { id: game.player2Id, name: "Player 2", createdAt: new Date() },
        availableActions,
        awaitingConversion,
        awaitingConversionAttempt,
        pendingConversionType,
        awaitingBonusDart,
        pendingStartPosition,
      });
    } catch (error) {
      console.error("Error getting game state:", error);
      res.status(500).json({ error: "Failed to fetch game state" });
    }
  });

  app.post("/api/games/:id/start-drive", async (req, res) => {
    try {
      const game = await storage.getGame(req.params.id);
      if (!game || game.status === "completed") {
        return res.status(400).json({ error: "Cannot start drive" });
      }

      const existingDrive = await storage.getCurrentDrive(game.id);
      if (existingDrive) {
        return res.status(400).json({ error: "Drive already in progress" });
      }

      const playerId = game.possession === 1 ? game.player1Id : game.player2Id;
      const startPosition = req.body.startPosition ?? 30;
      const startReason = req.body.startReason ?? "default_own_30";

      // Calculate drive sequence numbers
      const driveCount = await storage.getDriveCount(game.id);
      const allDrives = await storage.getDrives(game.id);
      const quarterDrives = allDrives.filter((d) => d.quarter === game.currentQuarter && d.playerId === playerId);

      const drive = await storage.createDrive({
        gameId: game.id,
        playerId,
        quarter: game.currentQuarter,
        startPosition,
        startReason,
        driveInQuarter: quarterDrives.length + 1,
        sequenceInGame: driveCount + 1,
      });

      await storage.createEvent({
        gameId: game.id,
        driveId: drive.id,
        playerId,
        type: "drive_start",
        data: { startPosition, quarter: game.currentQuarter, startReason },
        description: `Drive started at ${formatFieldPosition(startPosition)}`,
      });

      res.json(drive);
    } catch (error) {
      console.error("Error starting drive:", error);
      res.status(500).json({ error: "Failed to start drive" });
    }
  });

  app.post("/api/games/:id/ot-coin-flip", async (req, res) => {
    try {
      const game = await storage.getGame(req.params.id);
      if (!game || game.status !== "awaiting_ot_coin_flip") {
        return res.status(400).json({ error: "Game is not awaiting OT coin flip" });
      }

      const { winner, choice } = req.body;
      if (winner !== 1 && winner !== 2) {
        return res.status(400).json({ error: "Invalid coin flip winner" });
      }
      if (choice !== "receive" && choice !== "defer") {
        return res.status(400).json({ error: "Invalid choice (must be 'receive' or 'defer')" });
      }

      const firstPossession = choice === "receive" ? winner : winner === 1 ? 2 : 1;

      // Store both possession and firstPossession for OT
      // firstPossession is now repurposed to track who should start each OT period
      await storage.updateGame(game.id, {
        status: "overtime",
        possession: firstPossession,
        firstPossession: firstPossession,
      });

      const winnerPlayerId = winner === 1 ? game.player1Id : game.player2Id;

      await storage.createEvent({
        gameId: game.id,
        playerId: winnerPlayerId,
        type: "ot_coin_flip",
        data: { winner, choice, firstPossession },
        description:
          choice === "receive"
            ? `OT coin flip won! Elects to receive.`
            : `OT coin flip won! Defers - opponent receives.`,
      });

      res.json({ success: true, firstPossession });
    } catch (error) {
      console.error("Error handling OT coin flip:", error);
      res.status(500).json({ error: "Failed to handle OT coin flip" });
    }
  });

  app.post("/api/games/:id/conversion", async (req, res) => {
    try {
      const game = await storage.getGame(req.params.id);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      const { type } = req.body;
      if (type !== "pat" && type !== "two_point") {
        return res.status(400).json({ error: "Invalid conversion type" });
      }

      const playerId = game.possession === 1 ? game.player1Id : game.player2Id;
      const currentDrive = await storage.getCurrentDrive(game.id);

      await storage.createEvent({
        gameId: game.id,
        driveId: currentDrive?.id,
        playerId,
        type: "conversion_choice",
        data: { type },
        description: type === "pat" ? "Going for PAT (1 point)" : "Going for 2-point conversion",
      });

      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to choose conversion" });
    }
  });
}
