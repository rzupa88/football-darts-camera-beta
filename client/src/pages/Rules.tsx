import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Target, Goal, Trophy, Crosshair, ArrowRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const RULES_VERSION = "0.8";
const LAST_UPDATED = "2025-12-22";

export default function Rules() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-start gap-8">
        <aside className="hidden md:block w-48 sticky top-20">
          <nav className="space-y-1">
            <TOCLink href="#overview">Overview</TOCLink>
            <TOCLink href="#field">Field Model</TOCLink>
            <TOCLink href="#drives">Drives & Quarters</TOCLink>
            <TOCLink href="#scoring">Dart Scoring</TOCLink>
            <TOCLink href="#touchdowns">Touchdowns</TOCLink>
            <TOCLink href="#conversions">Conversions</TOCLink>
            <TOCLink href="#field-goals">Field Goals</TOCLink>
            <TOCLink href="#punting">Punting</TOCLink>
            <TOCLink href="#overtime">Overtime</TOCLink>
            <TOCLink href="#reference">Quick Reference</TOCLink>
          </nav>
        </aside>

        <main className="flex-1">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Game Rules</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs" data-testid="badge-version">
                  v{RULES_VERSION}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Updated {LAST_UPDATED}
                </span>
              </div>
            </div>
          </div>

          <div className="prose prose-neutral dark:prose-invert max-w-none">
            <Card className="mb-8" id="overview">
              <CardContent className="pt-6">
                <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                  <Target className="h-5 w-5" />
                  Overview
                </h2>
                <p className="text-muted-foreground">
                  A turn-based dart game that simulates American football using field position,
                  drives, special teams, and scoring decisions.
                </p>
                <p className="text-muted-foreground mt-2">
                  Two players compete in a 4-quarter game. Each quarter, both players get one
                  offensive drive. Drives consist of up to 4 dart throws to advance down the
                  field and score.
                </p>
              </CardContent>
            </Card>

            <section id="field" className="mb-8">
              <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                <Crosshair className="h-5 w-5" />
                Field Model
              </h2>
              <p className="text-muted-foreground mb-4">
                The field runs from 0 to 100 yards:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4">
                <li><strong>OWN 0</strong> = Your goal line</li>
                <li><strong>50</strong> = Midfield</li>
                <li><strong>OPP 0</strong> = Opponent's goal line (100 from your perspective)</li>
              </ul>
              <p className="text-muted-foreground">
                Default drive start position: <strong>OWN 30</strong>
              </p>

              <RulesTable
                headers={["Position", "Display"]}
                rows={[
                  ["Less than 50", "OWN {pos}"],
                  ["Exactly 50", "50"],
                  ["Greater than 50", "OPP {100-pos}"],
                ]}
              />
            </section>

            <Separator className="my-8" />

            <section id="drives" className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Drives & Quarters</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li><strong>4 quarters</strong> per game</li>
                <li>Each quarter: each player gets <strong>1 drive</strong></li>
                <li>Each drive: up to <strong>4 darts</strong></li>
                <li>Drive ends by: <strong>TD</strong>, <strong>FG attempt</strong>, <strong>Punt</strong>, or <strong>Bust</strong></li>
                <li>Bust is <strong>NOT</strong> a turnover - simply ends the drive</li>
              </ul>
            </section>

            <Separator className="my-8" />

            <section id="scoring" className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Dart Scoring (Offense)</h2>
              <RulesTable
                headers={["Dart Result", "Yards Gained"]}
                rows={[
                  ["Single", "Base number"],
                  ["Double", "Base x 2"],
                  ["Triple", "Base x 3"],
                  ["Outer Bull", "25 yards"],
                  ["Inner Bull", "Automatic Touchdown"],
                  ["Miss", "0 yards"],
                ]}
              />
            </section>

            <Separator className="my-8" />

            <section id="touchdowns" className="mb-8">
              <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                <Goal className="h-5 w-5" />
                Touchdowns (6 Points)
              </h2>
              <p className="text-muted-foreground mb-4">
                A touchdown is scored when <strong>either</strong>:
              </p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2 mb-4">
                <li><strong>Inner Bull</strong> is hit (automatic TD from anywhere)</li>
                <li>Offense advances <strong>exactly</strong> to the opponent goal line</li>
              </ol>
              <Card className="bg-muted/50">
                <CardContent className="py-4">
                  <p className="font-medium">Required Distance Formula</p>
                  <p className="text-muted-foreground text-sm mt-1">
                    Required yards = 100 − drive start position
                  </p>
                  <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                    <li>• If total drive yards = required → <span className="text-primary font-medium">TOUCHDOWN!</span></li>
                    <li>• If total drive yards &gt; required → <span className="text-destructive font-medium">BUST</span> (overshot)</li>
                  </ul>
                </CardContent>
              </Card>
            </section>

            <Separator className="my-8" />

            <section id="conversions" className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Conversions (1 dart after TD)</h2>
              <p className="text-muted-foreground mb-4">
                After scoring a touchdown, you must choose one:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <h3 className="font-semibold mb-2">PAT (1 Point)</h3>
                    <p className="text-sm text-muted-foreground">
                      Must hit any <strong>SINGLE</strong> segment between <strong>1-5</strong>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <h3 className="font-semibold mb-2">2-Point Try (2 Points)</h3>
                    <p className="text-sm text-muted-foreground">
                      Must hit the number <strong>2</strong> in <strong>ANY</strong> segment
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>

            <Separator className="my-8" />

            <section id="field-goals" className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Field Goals (3 Points)</h2>
              <p className="text-muted-foreground mb-4">
                <strong>Eligibility:</strong> Position must be at or past the 50-yard line (in opponent territory)
              </p>
              <p className="text-muted-foreground mb-4">
                Field goals are declared, use 1 dart, and end the drive.
              </p>

              <h3 className="font-medium mb-2">Target Bands (Based on Opponent Yard Line)</h3>
              <RulesTable
                headers={["Opp Yard Line", "Target Requirement"]}
                rows={[
                  ["0-29", "SINGLE 12, 13, 14, 15, 16, 17, or 18"],
                  ["30-39", "SINGLE 1, 2, 3, 4, or 5"],
                  ["40-50", "SINGLE 20 only"],
                ]}
              />
            </section>

            <Separator className="my-8" />

            <section id="punting" className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Punting</h2>
              <p className="text-muted-foreground mb-4">
                <strong>Eligibility:</strong>
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4">
                <li>Only on <strong>4th dart</strong></li>
                <li>Only when position is <strong>less than 50</strong> (your own territory)</li>
                <li>Must be <strong>declared</strong> before throwing</li>
              </ul>

              <h3 className="font-medium mb-2">Punt Results</h3>
              <RulesTable
                headers={["Dart Result", "Receiving Team Starts At"]}
                rows={[
                  ["Inner Bull", "OWN 5"],
                  ["Outer Bull", "OWN 10"],
                  ["Single (inner ring)", "OWN 30"],
                  ["Single (outer ring)", "OWN 20"],
                  ["Any Double", "OWN 20"],
                  ["Any Triple", "OWN 20 + return yards (base x 3)"],
                  ["Miss", "Blocked! Opponent starts at punt spot"],
                ]}
              />

              <Card className="bg-muted/50 mt-4">
                <CardContent className="py-4">
                  <p className="text-sm text-muted-foreground">
                    <strong>Triple Return Example:</strong> T20 hit → Receiving team starts at OWN 20, 
                    then advances 60 yards = starts at OPP 20
                  </p>
                </CardContent>
              </Card>
            </section>

            <Separator className="my-8" />

            <section id="overtime" className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Overtime</h2>
              <p className="text-muted-foreground mb-4">
                If the game is tied after 4 quarters:
              </p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2">
                <li>Both teams are <strong>guaranteed 1 possession</strong> each</li>
                <li>Drives start at <strong>OWN 30</strong> (unless modified by punt)</li>
                <li>After both teams have had a possession, any score that creates a <strong>lead</strong> immediately ends the game</li>
              </ol>
            </section>

            <Separator className="my-8" />

            <section id="reference" className="mb-8">
              <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                <Trophy className="h-5 w-5" />
                Quick Reference
              </h2>

              <h3 className="font-medium mb-2">Scoring Summary</h3>
              <RulesTable
                headers={["Play", "Points"]}
                rows={[
                  ["Touchdown", "6"],
                  ["PAT", "1"],
                  ["2-Point Conversion", "2"],
                  ["Field Goal", "3"],
                ]}
              />

              <h3 className="font-medium mb-2 mt-6">Key Rules</h3>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>4 quarters, 1 drive per player per quarter</li>
                <li>4 darts maximum per drive</li>
                <li>Inner Bull = automatic TD</li>
                <li>Must hit exact yards for TD (no overshoot)</li>
                <li>Punt only on 4th dart when in own territory</li>
                <li>FG only when at or past midfield</li>
              </ul>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function TOCLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="block text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
    >
      {children}
    </a>
  );
}

function RulesTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {headers.map((header, i) => (
              <th key={i} className="text-left py-2 px-3 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-3 text-muted-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
