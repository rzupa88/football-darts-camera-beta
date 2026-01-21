// shared/engine/dart.ts
import { DartResult, Multiplier } from "./types";

export function calculateDartYards(
  segment: number,
  multiplier: Multiplier,
): DartResult {
  const isInnerBull = multiplier === "inner_bull";
  const isOuterBull = multiplier === "outer_bull";

  let yards = 0;

  if (multiplier === "miss") {
    yards = 0;
  } else if (isInnerBull) {
    yards = 50; // Auto TD marker - handled separately
  } else if (isOuterBull) {
    yards = 25;
  } else {
    const baseValue = segment;
    switch (multiplier) {
      case "single_inner":
      case "single_outer":
        yards = baseValue;
        break;
      case "double":
        yards = baseValue * 2;
        break;
      case "triple":
        yards = baseValue * 3;
        break;
    }
  }

  return {
    segment,
    multiplier,
    yards,
    isInnerBull,
    isOuterBull,
  };
}

export function formatDartResult(dart: DartResult): string {
  if (dart.multiplier === "miss") return "Miss";
  if (dart.isInnerBull) return "Inner Bull";
  if (dart.isOuterBull) return "Outer Bull (25)";

  const prefix =
    dart.multiplier === "triple"
      ? "T"
      : dart.multiplier === "double"
        ? "D"
        : "S";

  return `${prefix}${dart.segment}`;
}
