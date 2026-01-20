---
rulesVersion: "0.9"
lastUpdated: "2025-12-22"
---

# FOOTBALL (DART GAME)

A turn-based dart game that simulates American football using field position, drives, special teams, and scoring decisions.

---

## OVERVIEW

Two players compete in a 4-quarter game. Each quarter, both players get **two offensive drives**. Drives consist of up to 4 dart throws to advance down the field and score.

---

## FIELD MODEL

The field runs from 0 to 100 yards:
- **OWN 0** = Your goal line
- **50** = Midfield
- **OPP 0** = Opponent's goal line (100 from your perspective)

Default drive start position: **OWN 30**

### Field Position Display
| Position | Display |
|----------|---------|
| Less than 50 | OWN {pos} |
| Exactly 50 | 50 |
| Greater than 50 | OPP {100-pos} |

---

## DRIVES & QUARTERS

- **4 quarters** per game
- Each quarter: each player gets **2 drives**
- Each drive: up to **4 darts**
- Drive ends by: **TD**, **FG attempt**, **Punt**, **Bust (overshoot)**, **Turnover on Downs**, or **Interception**

### Turnover on Downs
If you use all 4 darts without scoring or electing to punt/FG, the opponent takes over at the spot where you ended.

### Interceptions
Certain dart throws result in an interception (turnover):

| Dart Result | Effect |
|-------------|--------|
| D1 (Double 1) | Interception |
| T1 (Triple 1) | Interception |
| D3 (Double 3) | Interception |
| T3 (Triple 3) | Interception |

On an interception, the opponent takes over at the spot where you were intercepted (flipped to their perspective).

### Halftime Possession
The player who did **NOT** receive first in Q1 receives first in Q3 (like NFL halftime).

---

## DART SCORING (OFFENSE)

| Dart Result | Yards Gained |
|-------------|--------------|
| Single | Base number |
| Double | Base x 2 |
| Triple | Base x 3 |
| Outer Bull | 25 yards |
| Inner Bull | **Automatic Touchdown** |
| Miss | **-10 yards (Penalty)** |

### Penalty for Missing the Board
- Missing the dartboard completely results in a **10-yard penalty**
- You move backwards 10 yards from your current position
- The dart is consumed (counts against your 4 darts)
- If the penalty pushes you past your own goal line: **SAFETY** (opponent gets 2 points)

---

## TOUCHDOWNS (6 Points)

A touchdown is scored when **either**:

1. **Inner Bull** is hit (automatic TD from anywhere), OR
2. Offense advances **exactly** to the opponent goal line

### Required Distance
Required yards = 100 - drive start position

- If total drive yards = required: **TOUCHDOWN!**
- If total drive yards > required: **BUST** (overshot)

---

## CONVERSIONS (1 dart after TD)

After scoring a touchdown, you must choose one:

### PAT (1 Point)
- Target: Top arc of the dartboard
- Must hit segment **1, 5, or 20** (any multiplier: Single, Double, or Triple)

### 2-Point Try (2 Points)
- Declare "Going for 2"
- Must hit the number **2** in **ANY** segment (single, double, or triple)

---

## FIELD GOALS (3 Points)

**Eligibility:** Position must be at or past the 50-yard line (in opponent territory)

Field goals are declared, use 1 dart, and end the drive.

### Target Bands (Based on Opponent Yard Line)

| Opp Yard Line | Target Requirement |
|---------------|-------------------|
| 0-39 | Any hit on 1, 5, or 20 (single, double, or triple) |
| 40-50 | Any hit on 20 (single, double, or triple) |

**Note:** Any multiplier counts - singles, doubles, and triples are all good!

- **Make** = 3 points
- **Miss** = 0 points

---

## PUNTING

**Eligibility:**
- Only on **4th dart**
- Only when position is **less than 50** (your own territory)
- Must be **declared** before throwing

### Punt Results

| Dart Result | Receiving Team Starts At |
|-------------|--------------------------|
| Inner Bull | OWN 5 |
| Outer Bull | OWN 10 |
| Single (inner ring) | OWN 30 |
| Single (outer ring) | OWN 20 |
| Any Double | OWN 20 |
| Any Triple | OWN 20 + return yards (base x 3) |
| Miss | **Blocked!** Opponent starts at flipped position (OPP yard line) |

### Triple Return Example
T20 hit: Receiving team starts at OWN 20, then advances 60 yards = starts at OPP 20

### Punting From Inside Own 30
If you punt from inside your own 30 yard line, the punt effectiveness is reduced:
- **Penalty** = 30 - your current position
- Opponent's starting position is pushed forward by the penalty amount
- Capped at midfield (opponent cannot start past the 50)

**Example:** Punting from own 20, hit Outer 20 → normally opponent starts at their 20, but with 10-yard penalty → opponent starts at their 30.

**Punts never score points directly.**

---

## OVERTIME

If the game is tied after 4 quarters:

1. **Coin flip** - winner chooses to **receive** or **defer**
2. Each player gets **2 drives** per OT period
3. Drives start at **OWN 30** (unless modified by punt)
4. After both players complete 2 drives:
   - If one player is **ahead**, that player **wins**
   - If still **tied**, another OT period starts (same player goes first, no new coin flip)

---

## QUICK REFERENCE

### Scoring Summary
| Play | Points |
|------|--------|
| Touchdown | 6 |
| PAT | 1 |
| 2-Point Conversion | 2 |
| Field Goal | 3 |

### Key Rules
- 4 quarters, **2 drives per player per quarter**
- 4 darts maximum per drive
- Inner Bull = automatic TD
- Must hit exact yards for TD (no overshoot)
- Punt only on 4th dart when in own territory
- FG only when at or past midfield
- Q3 possession goes to whoever didn't start Q1
