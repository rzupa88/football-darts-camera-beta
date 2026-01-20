import { db } from "../server/db";
import { games, profiles } from "../shared/schema";
import { eq, and, desc, lt, or } from "drizzle-orm";

const WEIGHTS = {
  AVG_MARGIN: 0.45,
  POINTS_PER_DART: 0.25,
  FG_MAKE_RATE: 0.15,
  MISS_RATE: -0.10,
  BUST_RATE: -0.05,
};

const RECENT_WEIGHT = 0.70;
const ALLTIME_WEIGHT = 0.30;
const RECENT_GAMES_COUNT = 10;
const SHRINKAGE_PRIOR = 8;
const MARGIN_SCALE = 1.75;
const FIRST_POSSESSION_DISADVANTAGE = 2.95;

interface BacktestResult {
  gameId: string;
  player1Name: string;
  player2Name: string;
  expectedMargin: number;
  actualMargin: number;
  error: number;
  predictedWinner: string;
  actualWinner: string;
  correct: boolean;
}

async function getGamesBeforeDate(profileId: string, beforeDate: Date) {
  return db.select()
    .from(games)
    .where(
      and(
        eq(games.status, "completed"),
        lt(games.completedAt, beforeDate),
        or(eq(games.player1Id, profileId), eq(games.player2Id, profileId))
      )
    )
    .orderBy(desc(games.completedAt));
}

async function calculateProfileMetricsAtTime(profileId: string, beforeDate: Date) {
  const allGames = await getGamesBeforeDate(profileId, beforeDate);
  const recentGames = allGames.slice(0, RECENT_GAMES_COUNT);
  
  if (allGames.length === 0) {
    return {
      gamesPlayed: 0,
      avgMargin: 0,
      pointsPerDart: 0,
      fgMakeRate: 0,
      missRate: 0,
      bustRate: 0,
      avgPointsFor: 0,
      avgPointsAgainst: 0,
    };
  }

  const calcMarginStats = (gamesList: typeof allGames) => {
    let totalMargin = 0;
    let totalPointsFor = 0;
    let totalPointsAgainst = 0;
    
    for (const game of gamesList) {
      const isPlayer1 = game.player1Id === profileId;
      const pointsFor = isPlayer1 ? game.player1Score : game.player2Score;
      const pointsAgainst = isPlayer1 ? game.player2Score : game.player1Score;
      totalMargin += pointsFor - pointsAgainst;
      totalPointsFor += pointsFor;
      totalPointsAgainst += pointsAgainst;
    }
    
    return {
      avgMargin: gamesList.length > 0 ? totalMargin / gamesList.length : 0,
      avgPointsFor: gamesList.length > 0 ? totalPointsFor / gamesList.length : 0,
      avgPointsAgainst: gamesList.length > 0 ? totalPointsAgainst / gamesList.length : 0,
    };
  };

  const allTimeMargin = calcMarginStats(allGames);
  const recentMargin = calcMarginStats(recentGames);

  const weightedAvg = (recent: number, allTime: number) => {
    if (recentGames.length === 0) return allTime;
    if (recentGames.length >= RECENT_GAMES_COUNT) {
      return RECENT_WEIGHT * recent + ALLTIME_WEIGHT * allTime;
    }
    const recentScale = recentGames.length / RECENT_GAMES_COUNT;
    const adjustedRecentWeight = RECENT_WEIGHT * recentScale;
    const adjustedAllTimeWeight = 1 - adjustedRecentWeight;
    return adjustedRecentWeight * recent + adjustedAllTimeWeight * allTime;
  };

  return {
    gamesPlayed: allGames.length,
    avgMargin: weightedAvg(recentMargin.avgMargin, allTimeMargin.avgMargin),
    pointsPerDart: 0,
    fgMakeRate: 0,
    missRate: 0,
    bustRate: 0,
    avgPointsFor: weightedAvg(recentMargin.avgPointsFor, allTimeMargin.avgPointsFor),
    avgPointsAgainst: weightedAvg(recentMargin.avgPointsAgainst, allTimeMargin.avgPointsAgainst),
  };
}

function calculateZScoresSimple(metrics: { profileId: string; avgMargin: number; gamesPlayed: number }[]) {
  const values = metrics.map(m => m.avgMargin).filter(v => !isNaN(v) && isFinite(v));
  
  if (values.length === 0) {
    return new Map(metrics.map(m => [m.profileId, 0]));
  }
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);
  
  return new Map(metrics.map(m => {
    if (std === 0 || isNaN(m.avgMargin) || !isFinite(m.avgMargin)) {
      return [m.profileId, 0];
    }
    return [m.profileId, (m.avgMargin - mean) / std];
  }));
}

function calculatePower(zScore: number, gamesPlayed: number): number {
  const powerRaw = WEIGHTS.AVG_MARGIN * zScore;
  const w = gamesPlayed / (gamesPlayed + SHRINKAGE_PRIOR);
  return w * powerRaw;
}

async function backtestGame(game: typeof games.$inferSelect): Promise<BacktestResult | null> {
  const gameDate = game.completedAt || game.createdAt;
  
  const [metricsA, metricsB, allProfiles] = await Promise.all([
    calculateProfileMetricsAtTime(game.player1Id, gameDate),
    calculateProfileMetricsAtTime(game.player2Id, gameDate),
    db.select().from(profiles),
  ]);

  if (metricsA.gamesPlayed === 0 || metricsB.gamesPlayed === 0) {
    return null;
  }

  const allMetricsPromises = allProfiles.map(async p => ({
    profileId: p.id,
    ...(await calculateProfileMetricsAtTime(p.id, gameDate)),
  }));
  const allMetrics = await Promise.all(allMetricsPromises);
  
  const zScores = calculateZScoresSimple(allMetrics);
  
  const powerA = calculatePower(zScores.get(game.player1Id) || 0, metricsA.gamesPlayed);
  const powerB = calculatePower(zScores.get(game.player2Id) || 0, metricsB.gamesPlayed);

  let expectedMargin = (powerA - powerB) * MARGIN_SCALE;
  
  const firstPossessionId = game.firstPossession === 1 ? game.player1Id : game.player2Id;
  if (firstPossessionId === game.player1Id) {
    expectedMargin -= FIRST_POSSESSION_DISADVANTAGE;
  } else {
    expectedMargin += FIRST_POSSESSION_DISADVANTAGE;
  }

  const actualMargin = game.player1Score - game.player2Score;
  const error = Math.abs(expectedMargin - actualMargin);
  
  const player1 = allProfiles.find(p => p.id === game.player1Id);
  const player2 = allProfiles.find(p => p.id === game.player2Id);
  const winner = allProfiles.find(p => p.id === game.winnerId);
  
  const predictedWinner = expectedMargin > 0 ? (player1?.name || "P1") : (player2?.name || "P2");
  const actualWinner = winner?.name || "Unknown";
  const correct = (expectedMargin > 0 && game.winnerId === game.player1Id) ||
                  (expectedMargin < 0 && game.winnerId === game.player2Id);

  return {
    gameId: game.id,
    player1Name: player1?.name || "P1",
    player2Name: player2?.name || "P2",
    expectedMargin,
    actualMargin,
    error,
    predictedWinner,
    actualWinner,
    correct,
  };
}

async function runBacktest() {
  console.log("Running backtest on historical games...\n");
  
  const completedGames = await db.select()
    .from(games)
    .where(eq(games.status, "completed"))
    .orderBy(desc(games.completedAt));

  const results: BacktestResult[] = [];
  
  for (const game of completedGames) {
    const result = await backtestGame(game);
    if (result) {
      results.push(result);
    }
  }

  if (results.length === 0) {
    console.log("No games with sufficient history to backtest.");
    return;
  }

  const mae = results.reduce((sum, r) => sum + r.error, 0) / results.length;
  const correctPredictions = results.filter(r => r.correct).length;
  const accuracy = (correctPredictions / results.length) * 100;

  console.log("=== BACKTEST RESULTS ===\n");
  console.log(`Games Analyzed: ${results.length}`);
  console.log(`Mean Absolute Error (MAE): ${mae.toFixed(2)} points`);
  console.log(`Prediction Accuracy: ${correctPredictions}/${results.length} (${accuracy.toFixed(1)}%)`);
  console.log("\n--- Game-by-Game Results ---\n");

  for (const r of results) {
    const status = r.correct ? "✓" : "✗";
    console.log(`${status} ${r.player1Name} vs ${r.player2Name}`);
    console.log(`   Expected: ${r.expectedMargin > 0 ? '+' : ''}${r.expectedMargin.toFixed(1)} | Actual: ${r.actualMargin > 0 ? '+' : ''}${r.actualMargin} | Error: ${r.error.toFixed(1)}`);
    console.log(`   Predicted: ${r.predictedWinner} | Actual: ${r.actualWinner}\n`);
  }

  console.log("\n=== SUMMARY ===");
  console.log(`MAE: ${mae.toFixed(2)} points`);
  console.log(`Accuracy: ${accuracy.toFixed(1)}%`);
  console.log(`First Possession Adjustment: -${FIRST_POSSESSION_DISADVANTAGE} pts`);
  console.log(`Margin Scale: ${MARGIN_SCALE}`);
  console.log(`Shrinkage Prior: ${SHRINKAGE_PRIOR} games`);
}

runBacktest().catch(console.error);
