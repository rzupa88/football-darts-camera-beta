import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Circle, Crosshair, Play, Target, Trophy } from "lucide-react";
import type { GameEvent, Profile } from "@shared/schema";

function EventIcon({ type }: { type: string }) {
  switch (type) {
    case "touchdown":
      return <Trophy className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />;
    case "dart":
      return <Target className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />;
    case "fg_attempt":
      return <Crosshair className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />;
    case "game_start":
    case "drive_start":
      return <Play className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />;
  }
}

export function PlayByPlayFeed({
  events,
  player1,
  player2,
}: {
  events: GameEvent[];
  player1: Profile;
  player2: Profile;
}) {
  const sortedEvents = [...events].reverse();

  const getPlayerName = (playerId: string) => {
    if (playerId === player1.id) return player1.name;
    if (playerId === player2.id) return player2.name;
    return "Unknown";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Play-by-Play</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-48 lg:h-64">
          {sortedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No events yet</p>
          ) : (
            <div className="space-y-2">
              {sortedEvents.map((event, idx) => (
                <div
                  key={event.id || idx}
                  className={cn(
                    "flex items-start gap-3 py-2 px-3 rounded-md",
                    event.type === "touchdown" && "bg-primary/10",
                    event.type === "game_end" && "bg-accent"
                  )}
                  data-testid={`event-${event.id || idx}`}
                >
                  <EventIcon type={event.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{event.description}</p>
                    <p className="text-xs text-muted-foreground">{getPlayerName(event.playerId)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
