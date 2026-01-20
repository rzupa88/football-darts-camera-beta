# Football Dart Game - Design Guidelines

## Design Approach

**System Selected:** Material Design with Sports App Conventions

**Rationale:** This is a utility-focused game tracker requiring quick data entry during active gameplay, clear stats visualization, and reliable consistency. Design prioritizes efficiency and readability over visual flourish.

**Key Principles:**
1. Speed of interaction during live games
2. Scannable data hierarchy for stats
3. Clear action affordances
4. Mobile-first (players track while standing at dartboard)

---

## Core Design Elements

### Typography

**Font Family:** 
- Primary: Inter (Google Fonts) - clean, highly legible at all sizes
- Monospace: JetBrains Mono - for scores, stats, numerical data

**Hierarchy:**
- Page Titles: text-4xl font-bold (Inter)
- Section Headers: text-2xl font-semibold
- Scoreboard Numbers: text-6xl font-bold (JetBrains Mono)
- Stats/Data: text-lg font-medium (JetBrains Mono)
- Body Text: text-base
- Small Labels: text-sm text-gray-600

---

### Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12
- Tight spacing: p-2, gap-2 (action buttons, compact data)
- Standard spacing: p-4, gap-4 (cards, sections)
- Generous spacing: p-8, gap-8 (page sections)
- Large spacing: p-12 (page containers)

**Containers:**
- Page wrapper: max-w-6xl mx-auto px-4
- Game tracker: max-w-4xl (focused, mobile-optimized)
- Stats tables: max-w-7xl (allow horizontal space)

**Grid Patterns:**
- Profile cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4
- Head-to-head stats: grid-cols-2 gap-8
- Action buttons: grid-cols-2 gap-4 (mobile), grid-cols-4 gap-4 (desktop)

---

### Component Library

#### Navigation
- Top navigation bar with logo/title left, main links right
- Mobile: hamburger menu
- Active route: bold weight + subtle underline
- Links: Profiles | New Game | History | Rules

#### Game Tracker (`/game/[id]`)
**Scoreboard Section:**
- Full-width card at top
- Two-column layout (Player 1 vs Player 2)
- Large score display (text-6xl monospace)
- Quarter indicator centered between scores
- Possession arrow pointing to active player

**Field Position Display:**
- Visual representation: horizontal bar with markers
- OWN 0 ←→ 50 ←→ OPP 0
- Current position highlighted with large indicator
- Text display: "OWN 30" or "OPP 15" or "50"

**Dart Counter:**
- 4 circles, filled/unfilled showing current dart (1-4)
- Positioned below field display

**Action Buttons:**
- Large, touch-friendly: min-h-16
- Grid layout: 2 columns mobile, 4 columns desktop
- Disabled state: reduced opacity, cursor-not-allowed
- Primary actions: "Record Dart", "Attempt FG", "Punt"
- Secondary actions appear contextually (PAT/2PT after TD)

**Play-by-Play Feed:**
- Reverse chronological list
- Each entry: timestamp + icon + description
- TD entries: highlighted with subtle background
- Undo button: fixed bottom-right, circular FAB

#### Profile Cards
- Card with player name header
- Key stats grid: 3 columns
- Win percentage prominent (text-3xl)
- "View Details" link
- Hover: subtle elevation increase

#### Stats Tables
- Striped rows for readability
- Header row: font-semibold, subtle background
- Numerical columns: right-aligned, monospace
- Comparison highlighting: better stat gets subtle accent

#### Forms
- New Game Form: centered, max-w-md
- Player selectors: large dropdown buttons
- "Create Profile" inline modal: overlay with backdrop blur
- Coin flip button: large, playful animation on click
- Start Game: prominent primary button

#### Rules Page
- Clean typography-focused layout
- max-w-prose for optimal reading
- Headers with consistent hierarchy
- Code blocks for scoring tables
- Version badge at top
- Table of contents for navigation

#### History
- List of game cards
- Each card: date, players, final score, quarter count
- Click to expand/navigate to summary
- Filter options: by player, by date

---

### Animations

**Use Sparingly:**
- Coin flip: single playful rotation (0.8s)
- Undo action: brief highlight of removed entry (0.3s)
- Score update: number count-up animation (0.5s)
- Modal entrance: fade + scale (0.2s)
- NO scroll animations
- NO constant motion

---

## Images

**No images required.** This is a data-focused application. Use:
- SVG icons for navigation and actions (Material Icons via CDN)
- Dartboard SVG illustration on Rules page header
- Simple geometric backgrounds where needed (CSS gradients)

---

## Page-Specific Layouts

**Home/Landing (`/`):**
- Hero section (60vh): Bold headline "Football Dart Game", subtitle explaining concept
- CTA buttons: "Start New Game" + "View Rules"
- Quick stats: Total games played, active profiles
- Recent games feed (3 most recent)

**New Game (`/new`):**
- Centered card layout (max-w-lg)
- Two-step flow: Select players → Coin flip
- Profile selectors with avatars (initials)
- Inline "Create Profile" modal

**Game Tracker (`/game/[id]`):**
- Sticky scoreboard at top
- Field position + dart counter
- Action buttons grid
- Scrollable play-by-play below
- Undo FAB fixed bottom-right

**Profile Detail (`/profiles/[id]`):**
- Header: Name + overall stats (2-column grid)
- Tabs: All Stats | Head-to-Head | Game History
- Stats presented in organized tables
- Charts for win/loss ratio (simple bar/pie)

**History (`/history`):**
- Filter bar at top
- Grid of game summary cards
- Pagination if needed

**Rules (`/rules`):**
- Sidebar TOC (desktop)
- Main content: max-w-prose
- Version + last updated badge at top
- Tables for scoring reference

---

**Mobile Optimization:**
All layouts collapse to single column below md breakpoint. Game tracker remains fully functional on mobile with large touch targets (min 44px).