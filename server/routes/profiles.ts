// server/routes/profiles.ts
import type { Express } from "express";
import { storage } from "../storage";
import { insertProfileSchema } from "@shared/schema";

/**
 * Player profile routes
 * (Behavior matches the existing routes.ts endpoints)
 */
export function registerProfileRoutes(app: Express) {
  /**
   * List profiles (DEBUG ENABLED)
   */
  app.get("/api/profiles", async (_req, res) => {
    console.log("HIT new GET /api/profiles handler");
    try {
      const profiles = await storage.getProfiles();
      res.json(profiles);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("GET /api/profiles failed:", error);

      res.status(500).json({
        error: "Failed to fetch profiles",
        debug: message, // TEMP – remove after fix
      });
    }
  });

  app.get("/api/profiles/:id", async (req, res) => {
    try {
      const profile = await storage.getProfile(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      res.json(profile);
    } catch {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.post("/api/profiles", async (req, res) => {
    try {
      const parsed = insertProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid profile data" });
      }

      const profile = await storage.createProfile(parsed.data);
      res.status(201).json(profile);
    } catch {
      res.status(500).json({ error: "Failed to create profile" });
    }
  });

  app.patch("/api/profiles/:id", async (req, res) => {
    try {
      const profile = await storage.updateProfile(req.params.id, req.body);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      res.json(profile);
    } catch {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.get("/api/profiles/:id/stats", async (req, res) => {
    try {
      const stats = await storage.getProfileStats(req.params.id);
      res.json(stats);
    } catch {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/profiles/:id/head-to-head", async (req, res) => {
    try {
      const h2h = await storage.getProfileHeadToHead(req.params.id);
      res.json(h2h);
    } catch {
      res.status(500).json({ error: "Failed to fetch head-to-head" });
    }
  });

  app.get("/api/profiles/:id/games", async (req, res) => {
    try {
      const games = await storage.getProfileGames(req.params.id);
      res.json(games);
    } catch {
      res.status(500).json({ error: "Failed to fetch games" });
    }
  });

  // Heat map endpoint
  app.get("/api/profiles/:id/heat-map", async (req, res) => {
    try {
      const { gameId, opponentId, phase, dateFrom, dateTo } = req.query;

      const heatMapData = await storage.getHeatMapData({
        profileId: req.params.id,
        gameId: gameId as string | undefined,
        opponentId: opponentId as string | undefined,
        phase: phase as string | undefined,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
      });

      res.json(heatMapData);
    } catch (error) {
      console.error("Error fetching heat map:", error);
      res.status(500).json({ error: "Failed to fetch heat map data" });
    }
  });
}
