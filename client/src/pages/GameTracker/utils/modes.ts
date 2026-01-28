import type { ActionMode } from "./types";

export function getModeTitle(mode: ActionMode): string {
  switch (mode) {
    case "offense":
      return "Offense";
    case "fg":
      return "Field Goal Attempt";
    case "punt":
      return "Punt";
    case "pat":
      return "PAT Attempt";
    case "two_point":
      return "2-Point Attempt";
    case "bonus":
      return "Bonus Dart";
    default:
      return "Dartboard";
  }
}

export function getModeInstruction(mode: ActionMode): string {
  switch (mode) {
    case "offense":
      return "Advance the ball";
    case "fg":
      return "Hit target for 3 pts";
    case "punt":
      return "Pin opponent deep";
    case "pat":
      return "Single 1/5/20 = 1 pt";
    case "two_point":
      return "Hit #2 = 2 pts";
    case "bonus":
      return "Single 1 = TD!";
    default:
      return "";
  }
}
