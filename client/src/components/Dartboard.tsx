import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type DartSegment = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 25;
type DartMultiplier = "single_inner" | "single_outer" | "double" | "triple" | "inner_bull" | "outer_bull" | "miss";

interface DartboardProps {
  onSelect: (segment: DartSegment, multiplier: DartMultiplier) => void;
  disabled?: boolean;
}

const SEGMENTS_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

const BOARD_RADIUS = 170;
const DOUBLE_OUTER = 170;
const DOUBLE_INNER = 160;
const SINGLE_OUTER_INNER = 160;
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

function getSectionFromPosition(x: number, y: number, cx: number, cy: number): { segment: number; multiplier: DartMultiplier } | null {
  const dx = x - cx;
  const dy = y - cy;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance > DOUBLE_OUTER) return null;
  
  if (distance <= INNER_BULL) {
    return { segment: 25, multiplier: "inner_bull" };
  }
  if (distance <= OUTER_BULL) {
    return { segment: 25, multiplier: "outer_bull" };
  }
  
  let angle = Math.atan2(dx, -dy) * 180 / Math.PI;
  if (angle < 0) angle += 360;
  
  const segmentAngle = 360 / 20;
  const adjustedAngle = (angle + segmentAngle / 2) % 360;
  const segmentIndex = Math.floor(adjustedAngle / segmentAngle);
  const segment = SEGMENTS_ORDER[segmentIndex];
  
  let multiplier: DartMultiplier;
  if (distance <= SINGLE_INNER_OUTER && distance > OUTER_BULL) {
    multiplier = "single_inner";
  } else if (distance <= TRIPLE_OUTER && distance > TRIPLE_INNER) {
    multiplier = "triple";
  } else if (distance <= SINGLE_OUTER_INNER && distance > TRIPLE_OUTER) {
    multiplier = "single_outer";
  } else if (distance <= DOUBLE_OUTER && distance > DOUBLE_INNER) {
    multiplier = "double";
  } else {
    multiplier = "single_inner";
  }
  
  return { segment, multiplier };
}

function formatSection(segment: number, multiplier: DartMultiplier): string {
  if (multiplier === "inner_bull") return "Inner Bull";
  if (multiplier === "outer_bull") return "Outer Bull";
  if (multiplier === "double") return `Double ${segment}`;
  if (multiplier === "triple") return `Triple ${segment}`;
  return `Single ${segment}`;
}

export default function Dartboard({ onSelect, disabled = false }: DartboardProps) {
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [touchActive, setTouchActive] = useState(false);
  const [touchPosition, setTouchPosition] = useState<{ x: number; y: number } | null>(null);
  const [previewSection, setPreviewSection] = useState<{ segment: number; multiplier: DartMultiplier } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  
  const cx = 200;
  const cy = 200;
  const segmentAngle = 360 / 20;
  
  const getSegmentColor = (index: number, ring: "single" | "double" | "triple") => {
    const isEven = index % 2 === 0;
    if (ring === "double" || ring === "triple") {
      return isEven ? "#e62424" : "#1a8a1a";
    }
    return isEven ? "#1a1a1a" : "#f5deb3";
  };

  const handleClick = (segment: number, multiplier: DartMultiplier) => {
    if (disabled) return;
    onSelect(segment as DartSegment, multiplier);
  };

  const getSvgCoordinates = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = 400 / rect.width;
    const scaleY = 400 / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    const touch = e.touches[0];
    const coords = getSvgCoordinates(touch.clientX, touch.clientY);
    if (coords) {
      setTouchActive(true);
      setTouchPosition(coords);
      const section = getSectionFromPosition(coords.x, coords.y, cx, cy);
      setPreviewSection(section);
    }
  }, [disabled, getSvgCoordinates]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchActive) return;
    e.preventDefault();
    const touch = e.touches[0];
    const coords = getSvgCoordinates(touch.clientX, touch.clientY);
    if (coords) {
      setTouchPosition(coords);
      const section = getSectionFromPosition(coords.x, coords.y, cx, cy);
      setPreviewSection(section);
    }
  }, [touchActive, getSvgCoordinates]);

  const handleTouchEnd = useCallback(() => {
    if (touchActive && previewSection) {
      handleClick(previewSection.segment, previewSection.multiplier);
    }
    setTouchActive(false);
    setTouchPosition(null);
    setPreviewSection(null);
  }, [touchActive, previewSection]);

  const sections: JSX.Element[] = [];

  SEGMENTS_ORDER.forEach((segment, index) => {
    const startAngle = index * segmentAngle - segmentAngle / 2;
    const endAngle = startAngle + segmentAngle;

    const doubleId = `double-${segment}`;
    const isDoubleActive = previewSection?.segment === segment && previewSection?.multiplier === "double";
    sections.push(
      <path
        key={doubleId}
        d={describeArc(cx, cy, DOUBLE_INNER, DOUBLE_OUTER, startAngle, endAngle)}
        fill={getSegmentColor(index, "double")}
        stroke="#c0c0c0"
        strokeWidth="0.5"
        className={cn(
          "cursor-pointer transition-all",
          (hoveredSection === doubleId || isDoubleActive) && "brightness-125",
          disabled && "cursor-not-allowed opacity-50"
        )}
        onMouseEnter={() => setHoveredSection(doubleId)}
        onMouseLeave={() => setHoveredSection(null)}
        onClick={() => handleClick(segment, "double")}
        data-testid={`dartboard-double-${segment}`}
      />
    );

    const singleOuterId = `single-outer-${segment}`;
    const isSingleOuterActive = previewSection?.segment === segment && previewSection?.multiplier === "single_outer";
    sections.push(
      <path
        key={singleOuterId}
        d={describeArc(cx, cy, TRIPLE_OUTER, SINGLE_OUTER_INNER, startAngle, endAngle)}
        fill={getSegmentColor(index, "single")}
        stroke="#c0c0c0"
        strokeWidth="0.5"
        className={cn(
          "cursor-pointer transition-all",
          (hoveredSection === singleOuterId || isSingleOuterActive) && "brightness-125",
          disabled && "cursor-not-allowed opacity-50"
        )}
        onMouseEnter={() => setHoveredSection(singleOuterId)}
        onMouseLeave={() => setHoveredSection(null)}
        onClick={() => handleClick(segment, "single_outer")}
        data-testid={`dartboard-single-outer-${segment}`}
      />
    );

    const tripleId = `triple-${segment}`;
    const isTripleActive = previewSection?.segment === segment && previewSection?.multiplier === "triple";
    sections.push(
      <path
        key={tripleId}
        d={describeArc(cx, cy, TRIPLE_INNER, TRIPLE_OUTER, startAngle, endAngle)}
        fill={getSegmentColor(index, "triple")}
        stroke="#c0c0c0"
        strokeWidth="0.5"
        className={cn(
          "cursor-pointer transition-all",
          (hoveredSection === tripleId || isTripleActive) && "brightness-125",
          disabled && "cursor-not-allowed opacity-50"
        )}
        onMouseEnter={() => setHoveredSection(tripleId)}
        onMouseLeave={() => setHoveredSection(null)}
        onClick={() => handleClick(segment, "triple")}
        data-testid={`dartboard-triple-${segment}`}
      />
    );

    const singleInnerId = `single-inner-${segment}`;
    const isSingleInnerActive = previewSection?.segment === segment && previewSection?.multiplier === "single_inner";
    sections.push(
      <path
        key={singleInnerId}
        d={describeArc(cx, cy, OUTER_BULL, SINGLE_INNER_OUTER, startAngle, endAngle)}
        fill={getSegmentColor(index, "single")}
        stroke="#c0c0c0"
        strokeWidth="0.5"
        className={cn(
          "cursor-pointer transition-all",
          (hoveredSection === singleInnerId || isSingleInnerActive) && "brightness-125",
          disabled && "cursor-not-allowed opacity-50"
        )}
        onMouseEnter={() => setHoveredSection(singleInnerId)}
        onMouseLeave={() => setHoveredSection(null)}
        onClick={() => handleClick(segment, "single_inner")}
        data-testid={`dartboard-single-inner-${segment}`}
      />
    );
  });

  const isOuterBullActive = previewSection?.multiplier === "outer_bull";
  sections.push(
    <circle
      key="outer-bull"
      cx={cx}
      cy={cy}
      r={OUTER_BULL}
      fill="#1a8a1a"
      stroke="#c0c0c0"
      strokeWidth="0.5"
      className={cn(
        "cursor-pointer transition-all",
        (hoveredSection === "outer-bull" || isOuterBullActive) && "brightness-125",
        disabled && "cursor-not-allowed opacity-50"
      )}
      onMouseEnter={() => setHoveredSection("outer-bull")}
      onMouseLeave={() => setHoveredSection(null)}
      onClick={() => handleClick(25, "outer_bull")}
      data-testid="dartboard-outer-bull"
    />
  );

  const isInnerBullActive = previewSection?.multiplier === "inner_bull";
  sections.push(
    <circle
      key="inner-bull"
      cx={cx}
      cy={cy}
      r={INNER_BULL}
      fill="#e62424"
      stroke="#c0c0c0"
      strokeWidth="0.5"
      className={cn(
        "cursor-pointer transition-all",
        (hoveredSection === "inner-bull" || isInnerBullActive) && "brightness-125",
        disabled && "cursor-not-allowed opacity-50"
      )}
      onMouseEnter={() => setHoveredSection("inner-bull")}
      onMouseLeave={() => setHoveredSection(null)}
      onClick={() => handleClick(25, "inner_bull")}
      data-testid="dartboard-inner-bull"
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

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-[320px] md:max-w-[400px]">
        <svg
          ref={svgRef}
          viewBox="0 0 400 400"
          className="w-full touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <circle cx={cx} cy={cy} r={BOARD_RADIUS + 5} fill="#1a1a1a" />
          {sections}
        </svg>
        
        {touchActive && touchPosition && previewSection && (
          <div 
            className="fixed z-50 pointer-events-none"
            style={{
              left: '50%',
              top: '10%',
              transform: 'translateX(-50%)',
            }}
          >
            <div className="bg-card border-2 border-primary rounded-lg shadow-xl p-4 text-center min-w-[150px]">
              <div className="text-lg font-bold text-primary mb-1">
                {formatSection(previewSection.segment, previewSection.multiplier)}
              </div>
              <div className="text-sm text-muted-foreground">
                Release to select
              </div>
            </div>
          </div>
        )}
      </div>
      
      <Button
        type="button"
        variant="outline"
        onClick={() => handleClick(0, "miss")}
        disabled={disabled}
        data-testid="dartboard-miss"
      >
        Missed the Board
      </Button>
      
      {!touchActive && (hoveredSection || previewSection) && (
        <div className="text-sm text-muted-foreground h-5">
          {hoveredSection === "inner-bull" && "Inner Bull (50)"}
          {hoveredSection === "outer-bull" && "Outer Bull (25)"}
          {hoveredSection?.startsWith("double-") && `Double ${hoveredSection.split("-")[1]}`}
          {hoveredSection?.startsWith("triple-") && `Triple ${hoveredSection.split("-")[1]}`}
          {hoveredSection?.startsWith("single-outer-") && `Single ${hoveredSection.split("-")[2]}`}
          {hoveredSection?.startsWith("single-inner-") && `Single ${hoveredSection.split("-")[2]}`}
        </div>
      )}
    </div>
  );
}
