// MatchupOdds.v3.fixed.tsx
// No hardcoded first-possession edge; edge comes from backend.
// Fixes spread sign/display consistency and applies edge correctly.

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Profile } from "@shared/schema";

interface MatchupLine {
  /**
   * Convention:
   * spread = expected margin for player1 (player1_points - player2_points)
   * spread > 0 => player1 favored
   * spread < 0 => player2 favored
   */
  spread: number;

  moneylineA: number; // player1
  moneylineB: number; // player2
  total: number;

  expectedMargin: number; // should match spread sign convention
  pA: number;
  pB: number;

  /**
   * Optional, model-derived:
   * firstPossessionEdge is the *penalty to the receiving team* in points (>= 0).
   * If your model defines it differently, adjust the applyEdge() function below.
   */
  firstPossessionEdge?: number | null;
}

interface MatchupOddsProps {
  player1: Profile;
  player2: Profile;

  // 1 = player1 receives
  // 2 = player2 receives
  // null/undefined = pre-toss
  firstPossession?: number | null;
}

function formatMoneyline(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function roundToHalf(x: number): number {
  return Math.round(x * 2) / 2;
}

/**
 * Display as "FavoredName -X.X" (PK if ~0)
 * Uses the convention: spread > 0 => player1 favored.
 */
function formatSpreadDisplay(spread: number, p1: string, p2: string): string {
  if (!Number.isFinite(spread)) return "—";
  if (Math.abs(spread) < 0.001) return "PK";

  const p1Favored = spread > 0;
  const favoredName = (p1Favored ? p1 : p2).slice(0, 10);
  const lineValue = Math.abs(spread).toFixed(1);
  return `${favoredName} -${lineValue}`;
}

/**
 * Applies first-possession edge to the player1-margin spread.
 *
 * ASSUMPTION (recommended):
 * - firstPossessionEdge >= 0 means: "receiving first is a disadvantage of X points"
 *
 * If player1 receives, player1 expected margin decreases => spread -= edge
 * If player2 receives, player1 expected margin increases => spread += edge
 */
function applyFirstPossessionEdge(
  neutralSpread: number,
  firstPossession: 1 | 2,
  edge: number
): number {
  if (edge === 0) return neutralSpread;

  return firstPossession === 1
    ? neutralSpread - edge
    : neutralSpread + edge;
}

export default function MatchupOddsV3({
  player1,
  player2,
  firstPossession,
}: MatchupOddsProps) {
  const firstPossessionId =
    firstPossession === 1
      ? player1.id
      : firstPossession === 2
      ? player2.id
      : null;

  const { data: line, isLoading } = useQuery<MatchupLine>({
    queryKey: ["/api/matchup-line", player1.id, player2.id, firstPossessionId],
  });

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-r from-[#1b0f32] to-[#132654] border-0">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-center gap-8">
            <Skeleton className="h-10 w-24 bg-white/10" />
            <Skeleton className="h-10 w-32 bg-white/10" />
            <Skeleton className="h-10 w-24 bg-white/10" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!line) return null;

  // -------- PRE-COIN-TOSS (neutral) --------
  const neutralSpread = roundToHalf(line.spread);
  const neutralDisplay = formatSpreadDisplay(neutralSpread, player1.name, player2.name);

  // -------- POST-COIN-TOSS (data-driven only) --------
  const hasCoinToss = firstPossession === 1 || firstPossession === 2;
  const edge = Math.abs(line.firstPossessionEdge ?? 0); // treat edge magnitude as penalty

  const adjustedSpread =
    hasCoinToss && edge > 0
      ? roundToHalf(applyFirstPossessionEdge(neutralSpread, firstPossession as 1 | 2, edge))
      : null;

  const adjustedDisplay =
    adjustedSpread !== null
      ? formatSpreadDisplay(adjustedSpread, player1.name, player2.name)
      : null;

  const firstPlayer =
    firstPossession === 1 ? player1 : firstPossession === 2 ? player2 : null;

  return (
    <Card className="bg-gradient-to-r from-[#1b0f32] to-[#132654] border-0 overflow-hidden">
      <CardContent className="py-2 px-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-center">
            <span className="text-[10px] uppercase tracking-wider text-white/50 font-medium">
              Pre-Game Lines
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            {/* Spread */}
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                Spread
              </span>
              <div className="bg-black/30 rounded px-3 py-1.5">
                <span className="text-white font-bold text-sm">
                  {neutralDisplay}
                </span>
              </div>

              {adjustedDisplay && (
                <div className="mt-1 text-[9px] text-white/30">
                  After toss: {adjustedDisplay}
                </div>
              )}
            </div>

            {/* Moneyline */}
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                Moneyline
              </span>
              <div className="bg-black/30 rounded px-3 py-1.5 flex justify-center gap-3">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] text-white/50">
                    {player1.name.slice(0, 8)}
                  </span>
                  <span className="text-white font-bold text-sm">
                    {formatMoneyline(line.moneylineA)}
                  </span>
                </div>
                <div className="w-px bg-white/20" />
                <div className="flex flex-col items-center">
                  <span className="text-[9px] text-white/50">
                    {player2.name.slice(0, 8)}
                  </span>
                  <span className="text-white font-bold text-sm">
                    {formatMoneyline(line.moneylineB)}
                  </span>
                </div>
              </div>
            </div>

            {/* Total */}
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                Total
              </span>
              <div className="bg-black/30 rounded px-3 py-1.5">
                <span className="text-white font-bold text-sm">
                  O/U {line.total}
                </span>
              </div>
            </div>
          </div>

          {hasCoinToss && edge > 0 && firstPlayer && (
            <div className="flex items-center justify-center">
              <span className="text-[9px] text-white/30">
                {firstPlayer.name} receives first (-{edge.toFixed(2)} pts)
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
