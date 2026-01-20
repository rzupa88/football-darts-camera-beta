# Football Dart Game

A turn-based dart game that simulates American football using field position, drives, special teams, and scoring decisions.

## Overview

Two players compete in a 4-quarter game. Each quarter, both players get one offensive drive. Drives consist of up to 4 dart throws to advance down the field and score.

## Project Architecture

### Tech Stack
- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js
- **Styling**: Tailwind CSS + Shadcn UI
- **State Management**: TanStack Query (React Query)
- **Routing**: Wouter
- **Storage**: In-memory (MemStorage)

### Directory Structure
```
├── client/src/
│   ├── components/
│   │   ├── layout/        # Navigation, etc.
│   │   └── ui/            # Shadcn components
│   ├── pages/
│   │   ├── Home.tsx       # Landing page
│   │   ├── Profiles.tsx   # Player list
│   │   ├── ProfileDetail.tsx
│   │   ├── NewGame.tsx    # Game setup
│   │   ├── GameTracker.tsx # In-game UI
│   │   ├── History.tsx    # Past games
│   │   └── Rules.tsx      # Game rules
│   └── content/
│       └── rules.md       # Canonical rules
├── server/
│   ├── routes.ts          # API endpoints
│   └── storage.ts         # In-memory storage
├── shared/
│   ├── schema.ts          # Data models
│   └── engine/            # Game logic
│       ├── types.ts
│       └── engine.ts
└── design_guidelines.md   # UI/UX standards
```

## API Routes

### Profiles
- `GET /api/profiles` - List all profiles
- `GET /api/profiles/:id` - Get single profile
- `POST /api/profiles` - Create profile
- `PATCH /api/profiles/:id` - Update profile
- `GET /api/profiles/:id/stats` - Get profile stats
- `GET /api/profiles/:id/head-to-head` - Get H2H records
- `GET /api/profiles/:id/games` - Get profile games

### Games
- `GET /api/games` - List all games
- `GET /api/games/:id` - Get single game
- `POST /api/games` - Create game
- `GET /api/games/:id/state` - Get full game state
- `POST /api/games/:id/start-drive` - Start a drive
- `POST /api/games/:id/conversion` - Choose PAT/2PT
- `POST /api/games/:id/action` - Record dart/FG/punt
- `POST /api/games/:id/undo` - Undo last action

### Matchup Lines (Odds)
- `GET /api/matchup-line/:profileAId/:profileBId/:firstPossessionId` - Get pre-game lines (spread, moneyline, total)

## Game Rules (v0.9)

### Field Model
- Field = 0-100 yards
- OWN 0 = your goal, 50 = midfield, OPP 0 = opponent's goal (100)
- Default drive start: OWN 30

### Scoring
- **Touchdown**: 6 points (Inner Bull = auto TD, or exact distance)
- **PAT**: 1 point (Any 1, 5, or 20 - single, double, or triple)
- **2-Point**: 2 points (Hit number 2 in any segment)
- **Field Goal**: 3 points (based on distance)
  - 0-39 yd line: Any 1, 5, or 20 (single, double, or triple)
  - 40-50 yd line: Any 20 (single, double, or triple)

### Drive Rules
- 4 quarters, **2 drives per player per quarter**
- Up to 4 darts per drive
- Bust = overshoot the goal line
- Turnover on downs = use all 4 darts without scoring (opponent takes over at spot)
- Interception = D1, T1, D3, T3 during offensive dart (opponent takes over at spot)
- Missing the board = 10-yard penalty (safety if pushed past own goal line)
- Punt only on 4th dart when in own territory
- FG only when at or past midfield
- Q3 possession goes to whoever didn't start Q1 (halftime flip)

## Recent Changes

### 2026-01-14
- Added defer/receive option to coin flips (game start and OT)
- Updated overtime rules:
  - Each player gets 2 drives per OT period
  - After both complete 2 drives, if one leads they win
  - If tied, new OT period starts with same first possession (no new coin flip)
- Swapped GameTracker layout: dartboard left, scoreboard/play-by-play right
- Added large position indicator badge above scoreboard

### 2026-01-09
- Added Matchup Odds Maker feature
  - Pre-game lines: spread, moneyline, and total (O/U)
  - 70% last-10-games / 30% all-time weighted metrics
  - Z-score normalization across profiles
  - Power rating with shrinkage for small sample sizes
  - -2.95 first possession adjustment (data-derived disadvantage)
  - Backtesting script: 70.6% prediction accuracy, 5.36 MAE
- Fixed blocked punt logic to correctly flip field position

### 2025-12-22
- Initial MVP implementation
- Created all pages: Home, Profiles, New Game, Game Tracker, History, Rules
- Implemented game engine with full dart/FG/punt/conversion logic
- Added in-memory storage with seed data
- Styled with Tailwind and Shadcn components

## Development Notes

- Run with `npm run dev`
- Frontend binds to port 5000
- Game state is ephemeral (resets on server restart)
- Rules version: 0.8
