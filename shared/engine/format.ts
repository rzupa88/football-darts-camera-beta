// shared/engine/format.ts
export function formatFieldPosition(position: number): string {
  if (position < 50) {
    return `OWN ${position}`;
  } else if (position === 50) {
    return "50";
  } else {
    return `OPP ${100 - position}`;
  }
}
