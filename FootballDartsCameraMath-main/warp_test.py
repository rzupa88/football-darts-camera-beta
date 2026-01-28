import os
import cv2
import numpy as np

# ====== SETTINGS ======
OUTPUT_SIZE = 800  # 800x800 as requested

# If you collected the click coordinates while viewing a RESIZED image window
# (for example MAX_DISPLAY_SIZE=900 in main.py), set this to True.
# If you collected the coordinates on the FULL-RES original image, set False.
POINTS_ARE_FROM_RESIZED_DISPLAY = True
MAX_DISPLAY_SIZE = 900  # must match what you used when clicking, if any

# Your measured points (Outer Double Outside Bound) + center (center not used for warp)
CENTER = (291, 414)
TOP    = (291, 197)
BOTTOM = (291, 623)
LEFT   = (78,  414)
RIGHT  = (505, 414)

# ======================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGE_PATH = os.path.join(BASE_DIR, "assets", "test_images", "board.jpeg")  # change if needed

img = cv2.imread(IMAGE_PATH)
if img is None:
    raise FileNotFoundError(f"Could not load image at {IMAGE_PATH}")

h, w = img.shape[:2]
print("Loaded image:", IMAGE_PATH)
print("Image size:", w, "x", h)

def compute_display_scale(original_w, original_h, max_size):
    return min(max_size / original_w, max_size / original_h, 1.0)

scale = compute_display_scale(w, h, MAX_DISPLAY_SIZE)

def unscale_point(pt):
    """Convert a point from display coords back to original image coords."""
    if not POINTS_ARE_FROM_RESIZED_DISPLAY or scale == 1.0:
        return pt
    x, y = pt
    return (int(round(x / scale)), int(round(y / scale)))

# Convert your points into the coordinate space of the ORIGINAL image
center = unscale_point(CENTER)
top    = unscale_point(TOP)
right  = unscale_point(RIGHT)
bottom = unscale_point(BOTTOM)
left   = unscale_point(LEFT)

print("\nUsing points in ORIGINAL image coordinates:")
print("CENTER:", center)
print("TOP   :", top)
print("RIGHT :", right)
print("BOTTOM:", bottom)
print("LEFT  :", left)
print("Display scale was:", scale, "(only used if POINTS_ARE_FROM_RESIZED_DISPLAY=True)")

# Source points: order matters (TOP, RIGHT, BOTTOM, LEFT)
src = np.array([top, right, bottom, left], dtype=np.float32)

# Destination points: perfect head-on board in an 800x800 image
cx = OUTPUT_SIZE // 2
cy = OUTPUT_SIZE // 2
dst = np.array([
    (cx, 0),                 # TOP
    (OUTPUT_SIZE, cy),        # RIGHT
    (cx, OUTPUT_SIZE),        # BOTTOM
    (0, cy)                   # LEFT
], dtype=np.float32)

# Compute warp and apply it
H = cv2.getPerspectiveTransform(src, dst)
warped = cv2.warpPerspective(img, H, (OUTPUT_SIZE, OUTPUT_SIZE))

# Draw markers on the original image so you can visually confirm point locations
debug = img.copy()
for label, pt in [("C", center), ("T", top), ("R", right), ("B", bottom), ("L", left)]:
    cv2.circle(debug, pt, 6, (255, 0, 0), -1)  # blue dot
    cv2.putText(debug, label, (pt[0] + 8, pt[1] - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)

# Optionally shrink the debug view to fit your screen
if scale < 1.0:
    debug = cv2.resize(debug, (int(w * scale), int(h * scale)))

# Show results
cv2.imshow("Original (with calibration points)", debug)
cv2.imshow(f"Warped ({OUTPUT_SIZE}x{OUTPUT_SIZE})", warped)

# Save warped output for later steps
out_path = os.path.join(BASE_DIR, "assets", "test_images", f"board_warped_{OUTPUT_SIZE}.png")
cv2.imwrite(out_path, warped)
print("\nSaved warped image to:", out_path)

cv2.waitKey(0)
cv2.destroyAllWindows()
