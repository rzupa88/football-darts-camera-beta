import type { Profile } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Circle, ChevronRight } from "lucide-react";

export type DriveDotState = "points" | "empty" | "current" | "unused";

interface BroadcastHudProps {
  player1: Profile;
  player2: Profile;
  player1Score: number;
  player2Score: number;
  possession: number;
  currentQuarter: number;
  position: number;
  driveStartPosition: number;
  dartsUsed: number;
  isCompleted: boolean;
  winnerId: string | null;
  player1Drives: DriveDotState[];
  player2Drives: DriveDotState[];
  player1OTDrives?: DriveDotState[];
  player2OTDrives?: DriveDotState[];
}

export default function BroadcastHud({
  player1,
  player2,
  player1Score,
  player2Score,
  possession,
  currentQuarter,
  position,
  driveStartPosition,
  dartsUsed,
  isCompleted,
  winnerId,
  player1Drives,
  player2Drives,
  player1OTDrives,
  player2OTDrives,
}: BroadcastHudProps) {
  const isInOT = currentQuarter >= 5;
  const currentPlayer = possession === 1 ? player1 : player2;
  const dartDisplay = dartsUsed + 1;
  const yardsToTD = 100 - position;
  const downLabel = getOrdinal(dartDisplay);
  const positionLabel = formatFieldPosition(position);

  // Field positioning calculations (10% padding on each end for endzones)
  const fieldStart = 10;
  const fieldWidth = 80;
  const startPercent = (driveStartPosition / 100) * fieldWidth;
  const currentPercent = (position / 100) * fieldWidth;

  return (
    <div className="rounded-xl overflow-hidden shadow-2xl">
      {/* TOP TICKER */}
      <div 
        className="px-4 py-2 border-b border-white/10"
        style={{ background: 'linear-gradient(90deg, #111734, #1a1f3f)' }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          {!isCompleted && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-600 rounded text-[10px] font-bold text-white uppercase">
              <Circle className="h-2 w-2 fill-current animate-pulse" />
              LIVE
            </div>
          )}
          <span className="text-white/70 text-xs font-medium">
            Q{currentQuarter > 4 ? "OT" : currentQuarter}
          </span>
          <span className="text-white/80 text-xs font-semibold" data-testid="text-dart-count">
            {downLabel} & {yardsToTD}
          </span>
          <span className="text-white/70 text-xs" data-testid="text-field-position">
            @ {positionLabel}
          </span>
        </div>
        
        <p 
          className="mt-1 text-xs text-white/80"
          role="status"
          aria-live="polite"
          data-testid="possession-indicator"
        >
          <span className="sr-only">{currentPlayer.name} has possession</span>
          <span className="font-semibold text-white">{currentPlayer.name}</span>
          {" "}throwing dart {dartDisplay}...
        </p>
      </div>

      {/* FIELD PANEL */}
      <div 
        className="relative h-28"
        style={{ background: 'linear-gradient(135deg, #1b0f32, #132654)' }}
      >
        {/* End zones with visible borders */}
        <div 
          className="absolute left-0 top-0 bottom-0 w-[10%] border-r-2 border-white/30"
          style={{ background: 'linear-gradient(90deg, rgba(139, 31, 62, 0.5), transparent)' }}
        />
        <div 
          className="absolute right-0 top-0 bottom-0 w-[10%] border-l-2 border-white/30"
          style={{ background: 'linear-gradient(270deg, rgba(31, 79, 140, 0.5), transparent)' }}
        />

        {/* Yard lines */}
        <div className="absolute left-[25%] top-0 bottom-0 w-px bg-white/20" />
        <div className="absolute left-[50%] top-0 bottom-0 w-0.5 bg-white/30" />
        <div className="absolute left-[75%] top-0 bottom-0 w-px bg-white/20" />

        {/* Yard numbers */}
        <div className="absolute bottom-2 left-0 right-0 flex justify-between px-[15%]">
          <span className="text-xs font-mono font-bold text-white/40">20</span>
          <span className="text-xs font-mono font-bold text-white/50">50</span>
          <span className="text-xs font-mono font-bold text-white/40">20</span>
        </div>

        {/* Progress trail line - starts from drive start position */}
        {!isCompleted && currentPercent > startPercent && (
          <div 
            className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full"
            style={{
              left: `${fieldStart + startPercent}%`,
              width: `${currentPercent - startPercent}%`,
              background: 'linear-gradient(90deg, #b455f7, #ffd86b)',
              boxShadow: '0 0 12px rgba(180, 85, 247, 0.6)'
            }}
          />
        )}

        {/* Drive start marker */}
        {!isCompleted && (
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-white/40"
            style={{ left: `${fieldStart + startPercent}%` }}
          />
        )}

        {/* Ball position badge - Orange glow, positioned ABOVE the line */}
        <div 
          className="absolute top-[25%] -translate-y-1/2 z-10"
          style={{ left: `${fieldStart + currentPercent}%` }}
        >
          <div className="relative -translate-x-1/2">
            {/* Outer glow */}
            <div 
              className="absolute -inset-3 rounded-lg blur-md"
              style={{ background: 'radial-gradient(circle, rgba(255, 180, 71, 0.7), transparent 70%)' }}
            />
            {/* Badge */}
            <div 
              className="relative px-2.5 py-1 rounded text-[11px] font-bold text-black whitespace-nowrap"
              style={{
                background: 'linear-gradient(180deg, #ffb347, #ff8c00)',
                boxShadow: '0 0 16px rgba(255, 140, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)'
              }}
              data-testid="text-yards-to-td"
            >
              @ {positionLabel}
            </div>
            {/* Triangle pointer */}
            <div 
              className="mx-auto w-0 h-0 border-l-4 border-r-4 border-t-6 border-l-transparent border-r-transparent"
              style={{ borderTopColor: '#ff8c00' }}
            />
          </div>
        </div>

        {/* Direction chevrons */}
        <div className="absolute right-[15%] top-1/2 -translate-y-1/2 flex items-center opacity-40">
          <ChevronRight className="h-5 w-5 text-white" />
          <ChevronRight className="h-5 w-5 text-white -ml-3" />
        </div>
      </div>

      {/* LARGE POSITION BADGE */}
      {!isCompleted && (
        <div 
          className="flex items-center justify-center py-3"
          style={{ background: 'linear-gradient(90deg, #0d1229, #0a0f1e)' }}
        >
          <div className="relative">
            {/* Outer glow */}
            <div 
              className="absolute -inset-4 rounded-xl blur-lg"
              style={{ background: 'radial-gradient(circle, rgba(255, 180, 71, 0.5), transparent 70%)' }}
            />
            {/* Badge */}
            <div 
              className="relative px-6 py-2 rounded-lg text-2xl font-black text-black whitespace-nowrap tracking-wide"
              style={{
                background: 'linear-gradient(180deg, #ffb347, #ff8c00)',
                boxShadow: '0 0 24px rgba(255, 140, 0, 0.6), inset 0 2px 0 rgba(255,255,255,0.3)'
              }}
              data-testid="text-position-large"
            >
              @ {positionLabel}
            </div>
          </div>
        </div>
      )}

      {/* SCORE RIBBON */}
      <div 
        className="px-4 py-3"
        style={{ background: 'linear-gradient(90deg, #0a0f23, #080b18)' }}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Player 1 - Left side */}
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-1.5 h-12 rounded-full transition-all",
                !isCompleted && possession === 1
                  ? "bg-amber-400"
                  : "bg-white/15"
              )}
              style={!isCompleted && possession === 1 ? { boxShadow: '0 0 14px rgba(251,191,36,0.5)' } : {}}
            />
            <div>
              <p 
                className={cn(
                  "text-sm font-semibold truncate max-w-[80px]",
                  winnerId === player1.id ? "text-amber-400" : "text-white"
                )}
                data-testid="text-player1-name"
              >
                {player1.name}
              </p>
              <div className="flex items-center gap-2">
                <span 
                  className="text-4xl font-black text-white tracking-tight"
                  data-testid="text-player1-score"
                >
                  {player1Score}
                </span>
                {/* Drive dots for player 1 */}
                <div className="flex flex-col gap-1">
                  <div className="flex gap-0.5">
                    {player1Drives.map((state, i) => (
                      <DriveDot key={i} state={state} testId={`drive-dot-p1-${i}`} />
                    ))}
                  </div>
                  {isInOT && player1OTDrives && player1OTDrives.length > 0 && (
                    <div className="flex gap-0.5">
                      {player1OTDrives.map((state, i) => (
                        <DriveDot key={`ot-${i}`} state={state} testId={`drive-dot-p1-ot-${i}`} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Center - Quarter display */}
          <div className="flex flex-col items-center">
            <p className="text-lg font-bold text-white">
              Q{currentQuarter > 4 ? "OT" : currentQuarter}
            </p>
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
              Football Darts
            </p>
          </div>

          {/* Player 2 - Right side */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p 
                className={cn(
                  "text-sm font-semibold truncate max-w-[80px]",
                  winnerId === player2.id ? "text-amber-400" : "text-white"
                )}
                data-testid="text-player2-name"
              >
                {player2.name}
              </p>
              <div className="flex items-center gap-2 justify-end">
                {/* Drive dots for player 2 */}
                <div className="flex flex-col gap-1">
                  <div className="flex gap-0.5">
                    {player2Drives.map((state, i) => (
                      <DriveDot key={i} state={state} testId={`drive-dot-p2-${i}`} />
                    ))}
                  </div>
                  {isInOT && player2OTDrives && player2OTDrives.length > 0 && (
                    <div className="flex gap-0.5">
                      {player2OTDrives.map((state, i) => (
                        <DriveDot key={`ot-${i}`} state={state} testId={`drive-dot-p2-ot-${i}`} />
                      ))}
                    </div>
                  )}
                </div>
                <span 
                  className="text-4xl font-black text-white tracking-tight"
                  data-testid="text-player2-score"
                >
                  {player2Score}
                </span>
              </div>
            </div>
            <div
              className={cn(
                "w-1.5 h-12 rounded-full transition-all",
                !isCompleted && possession === 2
                  ? "bg-amber-400"
                  : "bg-white/15"
              )}
              style={!isCompleted && possession === 2 ? { boxShadow: '0 0 14px rgba(251,191,36,0.5)' } : {}}
            />
          </div>
        </div>

        {/* Dart indicators */}
        {!isCompleted && (
          <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-white/10">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className={cn(
                  "h-2.5 w-2.5 rounded-full transition-all",
                  n <= dartsUsed
                    ? "bg-amber-400"
                    : "bg-white/20 border border-white/30"
                )}
                style={n <= dartsUsed ? { boxShadow: '0 0 8px rgba(251,191,36,0.5)' } : {}}
                data-testid={`dart-indicator-${n}`}
              />
            ))}
            <span className="ml-2 text-[10px] text-white/40">Darts Used</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DriveDot({ state, testId }: { state: DriveDotState; testId: string }) {
  const colors: Record<DriveDotState, string> = {
    points: "bg-green-500",
    empty: "bg-red-500",
    current: "bg-yellow-400",
    unused: "bg-gray-600",
  };
  
  const shadows: Record<DriveDotState, string> = {
    points: "0 0 6px rgba(34, 197, 94, 0.5)",
    empty: "0 0 6px rgba(239, 68, 68, 0.5)",
    current: "0 0 6px rgba(250, 204, 21, 0.5)",
    unused: "none",
  };

  return (
    <div
      className={cn("h-2 w-2 rounded-full", colors[state])}
      style={{ boxShadow: shadows[state] }}
      data-testid={testId}
      title={state === "points" ? "Scored" : state === "empty" ? "No score" : state === "current" ? "Current drive" : "Unused"}
    />
  );
}

function formatFieldPosition(position: number): string {
  if (position < 50) return `OWN ${position}`;
  if (position === 50) return "50";
  return `OPP ${100 - position}`;
}

function getOrdinal(n: number): string {
  const ordinals = ["1ST", "2ND", "3RD", "4TH"];
  return ordinals[n - 1] || `${n}TH`;
}
