import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { HeatMapData, Profile, Game } from "@shared/schema";

interface HeatMapDartboardProps {
  profileId: string;
  opponents?: Profile[];
  games?: Game[];
}

const SEGMENTS_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

const BOARD_RADIUS = 170;
const DOUBLE_OUTER = 170;
const DOUBLE_INNER = 160;
const TRIPLE_OUTER = 107;
const TRIPLE_INNER = 99;
const SINGLE_INNER_OUTER = 99;
const OUTER_BULL = 16;
const INNER_BULL = 6.35;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = (angleDeg - 90) * Math.PI / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function describeArc(cx: number, cy: number, innerR: number, outerR: number, startAngle: number, endAngle: number) {
  const start1 = polarToCartesian(cx, cy, outerR, startAngle);
  const end1 = polarToCartesian(cx, cy, outerR, endAngle);
  const start2 = polarToCartesian(cx, cy, innerR, endAngle);
  const end2 = polarToCartesian(cx, cy, innerR, startAngle);
  
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  
  return [
    "M", start1.x, start1.y,
    "A", outerR, outerR, 0, largeArc, 1, end1.x, end1.y,
    "L", start2.x, start2.y,
    "A", innerR, innerR, 0, largeArc, 0, end2.x, end2.y,
    "Z"
  ].join(" ");
}

function getHeatColor(percentage: number): string {
  if (percentage === 0) return "rgba(255, 255, 255, 0.1)";
  
  const intensity = Math.min(percentage / 15, 1);
  
  if (intensity < 0.25) {
    return `rgba(59, 130, 246, ${0.3 + intensity * 0.7})`;
  } else if (intensity < 0.5) {
    return `rgba(34, 197, 94, ${0.5 + intensity * 0.5})`;
  } else if (intensity < 0.75) {
    return `rgba(234, 179, 8, ${0.6 + intensity * 0.4})`;
  } else {
    return `rgba(239, 68, 68, ${0.7 + intensity * 0.3})`;
  }
}

export default function HeatMapDartboard({ profileId, opponents, games }: HeatMapDartboardProps) {
  const [selectedOpponent, setSelectedOpponent] = useState<string>("all");
  const [selectedPhase, setSelectedPhase] = useState<string>("all");
  const [selectedGame, setSelectedGame] = useState<string>("all");
  const [hoveredSection, setHoveredSection] = useState<{ segment: number; ring: string; count: number; percentage: number } | null>(null);
  
  const queryParams = new URLSearchParams();
  if (selectedOpponent !== "all") queryParams.append("opponentId", selectedOpponent);
  if (selectedPhase !== "all") queryParams.append("phase", selectedPhase);
  if (selectedGame !== "all") queryParams.append("gameId", selectedGame);
  
  const { data: heatMapData, isLoading } = useQuery<HeatMapData[]>({
    queryKey: ["/api/profiles", profileId, "heat-map", queryParams.toString()],
    queryFn: async () => {
      const params = queryParams.toString();
      const url = `/api/profiles/${profileId}/heat-map${params ? `?${params}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch heat map data");
      return res.json();
    },
  });
  
  const getHeatForSection = (segment: number, ring: string): { count: number; percentage: number } => {
    if (!heatMapData) return { count: 0, percentage: 0 };
    const data = heatMapData.find(d => d.segment === segment && d.ring === ring);
    return { count: data?.count ?? 0, percentage: data?.percentage ?? 0 };
  };
  
  const totalThrows = heatMapData?.reduce((sum, d) => sum + d.count, 0) ?? 0;
  
  const cx = 200;
  const cy = 200;
  const segmentAngle = 360 / 20;
  
  const sections: JSX.Element[] = [];
  
  SEGMENTS_ORDER.forEach((segment, index) => {
    const startAngle = index * segmentAngle - segmentAngle / 2;
    const endAngle = startAngle + segmentAngle;
    
    const doubleData = getHeatForSection(segment, "double");
    sections.push(
      <path
        key={`double-${segment}`}
        d={describeArc(cx, cy, DOUBLE_INNER, DOUBLE_OUTER, startAngle, endAngle)}
        fill={getHeatColor(doubleData.percentage)}
        stroke="#c0c0c0"
        strokeWidth="0.5"
        className="transition-all"
        onMouseEnter={() => setHoveredSection({ segment, ring: "double", ...doubleData })}
        onMouseLeave={() => setHoveredSection(null)}
        data-testid={`heatmap-double-${segment}`}
      />
    );
    
    const singleOuterData = getHeatForSection(segment, "single_outer");
    sections.push(
      <path
        key={`single-outer-${segment}`}
        d={describeArc(cx, cy, TRIPLE_OUTER, DOUBLE_INNER, startAngle, endAngle)}
        fill={getHeatColor(singleOuterData.percentage)}
        stroke="#c0c0c0"
        strokeWidth="0.5"
        className="transition-all"
        onMouseEnter={() => setHoveredSection({ segment, ring: "single_outer", ...singleOuterData })}
        onMouseLeave={() => setHoveredSection(null)}
        data-testid={`heatmap-single-outer-${segment}`}
      />
    );
    
    const tripleData = getHeatForSection(segment, "triple");
    sections.push(
      <path
        key={`triple-${segment}`}
        d={describeArc(cx, cy, TRIPLE_INNER, TRIPLE_OUTER, startAngle, endAngle)}
        fill={getHeatColor(tripleData.percentage)}
        stroke="#c0c0c0"
        strokeWidth="0.5"
        className="transition-all"
        onMouseEnter={() => setHoveredSection({ segment, ring: "triple", ...tripleData })}
        onMouseLeave={() => setHoveredSection(null)}
        data-testid={`heatmap-triple-${segment}`}
      />
    );
    
    const singleInnerData = getHeatForSection(segment, "single_inner");
    sections.push(
      <path
        key={`single-inner-${segment}`}
        d={describeArc(cx, cy, OUTER_BULL, TRIPLE_INNER, startAngle, endAngle)}
        fill={getHeatColor(singleInnerData.percentage)}
        stroke="#c0c0c0"
        strokeWidth="0.5"
        className="transition-all"
        onMouseEnter={() => setHoveredSection({ segment, ring: "single_inner", ...singleInnerData })}
        onMouseLeave={() => setHoveredSection(null)}
        data-testid={`heatmap-single-inner-${segment}`}
      />
    );
  });
  
  const outerBullData = getHeatForSection(25, "outer_bull");
  sections.push(
    <circle
      key="outer-bull"
      cx={cx}
      cy={cy}
      r={OUTER_BULL}
      fill={getHeatColor(outerBullData.percentage)}
      stroke="#c0c0c0"
      strokeWidth="0.5"
      className="transition-all"
      onMouseEnter={() => setHoveredSection({ segment: 25, ring: "outer_bull", ...outerBullData })}
      onMouseLeave={() => setHoveredSection(null)}
      data-testid="heatmap-outer-bull"
    />
  );
  
  const innerBullData = getHeatForSection(25, "inner_bull");
  sections.push(
    <circle
      key="inner-bull"
      cx={cx}
      cy={cy}
      r={INNER_BULL}
      fill={getHeatColor(innerBullData.percentage)}
      stroke="#c0c0c0"
      strokeWidth="0.5"
      className="transition-all"
      onMouseEnter={() => setHoveredSection({ segment: 25, ring: "inner_bull", ...innerBullData })}
      onMouseLeave={() => setHoveredSection(null)}
      data-testid="heatmap-inner-bull"
    />
  );
  
  SEGMENTS_ORDER.forEach((segment, index) => {
    const angle = index * segmentAngle;
    const pos = polarToCartesian(cx, cy, DOUBLE_OUTER + 15, angle);
    sections.push(
      <text
        key={`label-${segment}`}
        x={pos.x}
        y={pos.y}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground text-xs font-bold pointer-events-none select-none"
      >
        {segment}
      </text>
    );
  });
  
  const formatRing = (ring: string) => {
    switch (ring) {
      case "inner_bull": return "Inner Bull";
      case "outer_bull": return "Outer Bull";
      case "double": return "Double";
      case "triple": return "Triple";
      case "single_inner": return "Single (Inner)";
      case "single_outer": return "Single (Outer)";
      default: return ring;
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Throw Heat Map</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="space-y-2">
            <Label htmlFor="phase-filter">Phase</Label>
            <Select value={selectedPhase} onValueChange={setSelectedPhase}>
              <SelectTrigger id="phase-filter" data-testid="select-phase-filter">
                <SelectValue placeholder="All phases" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All phases</SelectItem>
                <SelectItem value="offense">Offense</SelectItem>
                <SelectItem value="field_goal">Field Goal</SelectItem>
                <SelectItem value="punt">Punt</SelectItem>
                <SelectItem value="conversion_pat">PAT</SelectItem>
                <SelectItem value="conversion_two">2-Point</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {opponents && opponents.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="opponent-filter">Opponent</Label>
              <Select value={selectedOpponent} onValueChange={setSelectedOpponent}>
                <SelectTrigger id="opponent-filter" data-testid="select-opponent-filter">
                  <SelectValue placeholder="All opponents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All opponents</SelectItem>
                  {opponents.map((opp) => (
                    <SelectItem key={opp.id} value={opp.id}>
                      {opp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {games && games.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="game-filter">Game</Label>
              <Select value={selectedGame} onValueChange={setSelectedGame}>
                <SelectTrigger id="game-filter" data-testid="select-game-filter">
                  <SelectValue placeholder="All games" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All games</SelectItem>
                  {games.slice(0, 10).map((game) => (
                    <SelectItem key={game.id} value={game.id}>
                      {new Date(game.createdAt).toLocaleDateString()} - {game.player1Score} vs {game.player2Score}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        
        <div className="flex flex-col items-center gap-4">
          {isLoading ? (
            <Skeleton className="w-full max-w-[320px] aspect-square rounded-full" />
          ) : (
            <>
              <div className="relative w-full max-w-[320px]">
                <svg viewBox="0 0 400 400" className="w-full">
                  <circle cx={cx} cy={cy} r={BOARD_RADIUS + 5} fill="#1a1a1a" />
                  {sections}
                </svg>
              </div>
              
              <div className="text-center space-y-2">
                {hoveredSection ? (
                  <div className="text-sm">
                    <span className="font-medium">
                      {formatRing(hoveredSection.ring)} {hoveredSection.segment !== 25 ? hoveredSection.segment : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}{hoveredSection.count} throws ({hoveredSection.percentage.toFixed(1)}%)
                    </span>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Hover over sections to see details
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  Total throws: {totalThrows}
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Low</span>
                <div className="flex gap-1">
                  <div className="w-4 h-4 rounded" style={{ background: getHeatColor(2) }} />
                  <div className="w-4 h-4 rounded" style={{ background: getHeatColor(5) }} />
                  <div className="w-4 h-4 rounded" style={{ background: getHeatColor(8) }} />
                  <div className="w-4 h-4 rounded" style={{ background: getHeatColor(12) }} />
                </div>
                <span className="text-muted-foreground">High</span>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
