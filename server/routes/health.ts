// server/routes/health.ts
import type { Express } from "express";

/**
 * Health / diagnostics routes.
 * Keeps behavior identical to the current /api/health implementation in routes.ts.
 */
export function registerHealthRoutes(app: Express) {
  app.get("/api/health", async (_req, res) => {
    try {
      const appName = process.env.APP_NAME ?? "unknown";
      const nodeEnv = process.env.NODE_ENV ?? "unknown";
      const port = process.env.PORT ? Number(process.env.PORT) : null;

      // Parse DATABASE_URL safely
      let dbName: string | null = null;
      let dbHost: string | null = null;

      if (process.env.DATABASE_URL) {
        try {
          const url = new URL(process.env.DATABASE_URL);
          dbName = url.pathname.replace("/", "");
          dbHost = url.hostname;
        } catch {
          dbName = "invalid DATABASE_URL";
        }
      }

      // Optional git info (safe if unavailable)
      const git = { branch: null as string | null, sha: null as string | null };
      try {
        const { execSync } = await import("child_process");
        git.branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
        git.sha = execSync("git rev-parse --short HEAD").toString().trim();
      } catch {
        // ignore — git not available (Pi prod, etc.)
      }

      // Guardrail warning
      const warnings: string[] = [];
      if (appName.includes("beta") && dbName && !dbName.includes("beta")) {
        warnings.push("BETA app is NOT using a beta database");
      }
      if (!appName.includes("beta") && dbName && dbName.includes("beta")) {
        warnings.push("⚠️PROD app is pointing at a beta database");
      }

      res.json({
        app: appName,
        env: nodeEnv,
        port,
        db: dbName,
        databaseHost: dbHost,
        git,
        warnings,
        time: new Date().toISOString(),
      });
    } catch {
      res.status(500).json({
        status: "error",
        message: "health check failed",
      });
    }
  });
}
