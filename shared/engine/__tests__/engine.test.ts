import { describe, it, expect, vi, beforeEach } from "vitest";

// ✅ Mock ids BEFORE importing engine
vi.mock("../ids", () => ({
  generateId: vi.fn(),
}));

import { generateId } from "../ids";
import { createGame, startNextDrive } from "../engine";

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(1700000000000);

  // deterministic ids
  (generateId as unknown as { mockReturnValue: (v: string) => void }).mockReturnValue("test-id");
});

describe("startNextDrive", () => {
  it("creates a drive and appends a drive_start event", () => {
    const game = createGame("p1", "p2", 1);
    const next = startNextDrive(game, 30);

    expect(next.currentDrive).toBeTruthy();
    expect(next.currentDrive?.playerId).toBe("p1");
    expect(next.currentDrive?.quarter).toBe(1);
    expect(next.currentDrive?.startPosition).toBe(30);
    expect(next.currentDrive?.currentPosition).toBe(30);

    const lastEvent = next.events[next.events.length - 1];
    expect(lastEvent.type).toBe("drive_start");
    expect(lastEvent.playerId).toBe("p1");
    expect(lastEvent.timestamp).toBe(1700000000000);

    // ✅ now we can safely assert ids line up
    expect(lastEvent.driveId).toBe(next.currentDrive?.id);
  });
});