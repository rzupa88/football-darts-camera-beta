import math
import json
import os


class Dartboard:
    # Standard dartboard order starting at 20 at the top, clockwise
    SECTOR_NUMBERS = [
        20, 1, 18, 4, 13,
        6, 10, 15, 2, 17,
        3, 19, 7, 16, 8,
        11, 14, 9, 12, 5
    ]

    def __init__(self, center_x, center_y, radius):
        self.cx = center_x
        self.cy = center_y
        self.radius = radius

        # -------------------------
        # Load ring calibration
        # -------------------------
        config_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "config",
            "rings.json"
        )

        with open(config_path, "r") as f:
            cfg = json.load(f)

        # Angle offset (for board rotation)
        self.angle_offset_degrees = cfg.get("angle_offset_degrees", 0)
        self.angle_offset_radians = math.radians(self.angle_offset_degrees)

        # -------------------------
        # Ring radii (pixels)
        # -------------------------
        R = radius  # outer double edge

        self.inner_bull = (cfg["inner_bull_pct"] / 100.0) * R
        self.outer_bull = (cfg["outer_bull_pct"] / 100.0) * R

        self.triple_inner = (cfg["triple_inner_pct"] / 100.0) * R
        self.triple_outer = (cfg["triple_outer_pct"] / 100.0) * R

        self.double_inner = (cfg["double_inner_pct"] / 100.0) * R
        self.double_outer = (cfg["double_outer_pct"] / 100.0) * R


    # -------------------------
    # Geometry helpers
    # -------------------------
    def distance_from_center(self, x, y):
        dx = x - self.cx
        dy = y - self.cy
        return math.sqrt(dx * dx + dy * dy)

    def ring_for_point(self, x, y):
        d = self.distance_from_center(x, y)

        # Bulls
        if d <= self.inner_bull:
            return "INNER BULL"
        elif d <= self.outer_bull:
            return "OUTER BULL"

        # Miss
        if d > self.radius:
            return "MISS"

        # Triple / Double rings
        if self.triple_inner <= d <= self.triple_outer:
            return "TRIPLE"
        if self.double_inner <= d <= self.double_outer:
            return "DOUBLE"

        # Singles (everything else inside board)
        # Inner single: outside outer bull but inside triple ring
        if d < self.triple_inner:
            return "SINGLE_INNER"

        # Outer single: outside triple ring but inside double ring
        # (d > triple_outer is guaranteed here because triple handled above)
        if d < self.double_inner:
            return "SINGLE_OUTER"

        # Safety fallback (shouldn’t hit because double handled above)
        return "MISS"


    # -------------------------
    # Angle → sector mapping
    # -------------------------
    def sector_index_for_point(self, x, y):
        dx = x - self.cx
        dy = y - self.cy

        # 0 radians = straight up, increasing clockwise
        theta = math.atan2(dx, -dy) + self.angle_offset_radians

        if theta < 0:
            theta += 2 * math.pi
        elif theta >= 2 * math.pi:
            theta -= 2 * math.pi

        sector_width = (2 * math.pi) / 20.0
        return int(theta / sector_width)

    def number_for_point(self, x, y):
        idx = self.sector_index_for_point(x, y)
        return self.SECTOR_NUMBERS[idx]

    # -------------------------
    # Final dart result
    # -------------------------
    def dart_result_for_point(self, x, y):
        ring = self.ring_for_point(x, y)

        if ring == "INNER BULL":
            return {"code": "IB", "ring": ring, "number": None, "points": 50}

        if ring == "OUTER BULL":
            return {"code": "OB", "ring": ring, "number": None, "points": 25}

        if ring == "MISS":
            return {"code": "MISS", "ring": ring, "number": None, "points": 0}

        number = self.number_for_point(x, y)

        if ring == "TRIPLE":
            return {
                "code": f"T{number}",
                "ring": ring,
                "number": number,
                "points": 3 * number,
            }

        if ring == "DOUBLE":
            return {
                "code": f"D{number}",
                "ring": ring,
                "number": number,
                "points": 2 * number,
            }

        return {
            "code": f"S{number}",
            "ring": ring,
            "number": number,
            "points": number,
        }