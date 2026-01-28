import type { DartSegment, DartMultiplier } from "./types";

export function formatFieldPosition(position: number): string {
  if (position < 50) return `OWN ${position}`;
  if (position === 50) return "50";
  return `OPP ${100 - position}`;
}

export function formatDartSelection(segment: DartSegment, multiplier: DartMultiplier): string {
  if (multiplier === "miss") return "Miss";
  if (multiplier === "inner_bull") return "Inner Bull (Auto TD!)";
  if (multiplier === "outer_bull") return "Outer Bull (25 yards)";

  const prefix = multiplier === "triple" ? "T" : multiplier === "double" ? "D" : "S";
  const suffix =
    multiplier === "single_inner" ? " (inner)" : multiplier === "single_outer" ? " (outer)" : "";

  let yards = segment;
  if (multiplier === "double") yards = segment * 2;
  if (multiplier === "triple") yards = segment * 3;

  return `${prefix}${segment}${suffix} (${yards} yards)`;
}
