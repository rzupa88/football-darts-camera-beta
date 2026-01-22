// server/routes.ts

import type { Express } from "express";
import type { Server } from "http";

import { storage } from "./storage";
import { getMatchupLine } from "./odds";

import { registerHealthRoutes } from "./routes/health";
import { registerProfileRoutes } from "./routes/profiles";
import { registerGameRoutes } from "./routes/games";
import { registerDartRoutes } from "./routes/darts";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  registerHealthRoutes(app);
  registerProfileRoutes(app);
  registerGameRoutes(app);
  registerDartRoutes(app, storage);

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

  return httpServer;
}
