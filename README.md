# Play Eval

A ranked list of every NBA player by Play Eval, updated automatically every morning (the workflow is set to run
at four times a day, because GitHub sometimes skips a scheduled run; extra runs only add what's new):

    ((Points + Assists x2 + Rebounds x2 + Steals x4 + Blocks) - Turnovers x4) / Minutes

(The same as per-game numbers divided by minutes per game.)

The NBA didn't track turnovers before 1977-78, so nothing is subtracted for 1973-74 to 1976-77 (marked * on the site).

Season totals come from Basketball-Reference. A GitHub Action (`.github/workflows/update-stats.yml`)
runs `update_stats.py` once a day, saves the results to `data/stats.json` and `data/history.json`,
and the page (`index.html`) reads them.

- Change the stat's name or the default qualifying minimums at the top of the `<script>` in `index.html`.
- Every finished season back to 1973-74 is downloaded once (the first run takes about 5 minutes) and kept in
  `data/season-YYYY.json`; `data/alltime.json` holds every player-season for the all-time list and career charts.
  1973-74 is the first season the NBA tracked steals, blocks, and offensive/defensive rebounds.
- Change the update time with the `cron` line in the workflow (it's in UTC).
- To update right now: Actions tab -> "Update NBA stats" -> Run workflow.

## Pages

A **Pages** menu at the top of every page (`nav.js`) links to:

- **Home** (`index.html`) -- the Play Eval leaderboard
- **Players** (`index.html#/players`, `players.js`) -- every player under contract, grouped by team, with salary and
  latest Play Eval; the search also finds every player since 1973-74. Each row opens that player's page.
- **Trade Machine** (`trade.html`, `trade.js`) -- build a trade between 2-5 teams with players, draft picks (up to
  seven drafts out, with protections or swaps) and cash, and see whether it would go through: salary matching,
  the first and second apron limits (no taking back extra salary above the first apron; no aggregating salaries,
  sending cash or trading the frozen pick seven years out above the second), the Stepien rule, the cash limit and
  roster size. Salaries come from `data/contracts.json`. **Update the cap, tax and apron numbers in `cap.js` each July.** "Copy link to this trade" saves the whole trade in the address.

On the all-time lists (best seasons and best careers), picking a team counts only what each player did for that
team, games played included. Players who changed teams mid-season have their team-by-team numbers saved as
`splits` in each season file and in `data/alltime.json`.

The Team list has today's 30 franchises. Teams that moved or were renamed count toward the franchise they became
(Seattle SuperSonics -> Thunder, New Jersey Nets -> Nets, Vancouver -> Grizzlies, Charlotte Hornets 1988-2002 and
Bobcats -> Hornets, and so on), and every row is shown under today's team (hover a team to see the name it had then). The list is `FRANCHISE` in
`index.html`.

- **Teams** (`team.html#OKC`, `team.js`) -- one page per team: team stats with league ranks (offense, defense and
  net rating per 100 possessions, pace, shooting, rebounding, turnovers...), filters (last 5/10/15/20/30 games,
  home/away, opponents above or below .500, wins/losses, opponent conference or division, rest days, month,
  close games or blowouts), a lineup tool (pick 2-5 players to see the team's offense and defense per 100
  possessions with all of them on the floor vs. the rest of the time, plus the best 2/3/4/5-man groups), roster
  stats, schedule, injury report, cap sheet, draft picks, head coach, executive and owner.
  Built each morning by `build_teams.py` from this season's games (`espn_games.py` saves each game's team box
  score and every five-man lineup's minutes, points and possessions) and `teams_extra.py` (coach/executive from
  Basketball-Reference, future draft picks from RealGM, injuries from ESPN). Owners are typed into
  `data/owners.json` -- edit it when a team is sold. League salary numbers live in `cap.js`.

To add a page to the menu, add a line to `PAGES` at the top of `nav.js`.

## Player pages

Click the "Player page" button on any leaderboard row to open that player's page. Active players get their
current team's logo and colors, a This Season section and a Career to Date section. Retired players get the
NBA's colors, every team they played for, total career earnings, and a Career section.
Each morning the update also runs:

- `bbr_extra.py` -- bios (weekly), draft picks (once per draft), contracts (daily) and past salaries (each
  team-season page once, about 40 minutes' worth per run) from Basketball-Reference
- `espn_games.py` -- this season's schedule and every finished game's box score and play-by-play from ESPN's
  public feeds: game logs, shot zones and locations, assist partners, steal types, block locations, team box
  scores and five-man lineups. (`nba_games.py` reads the NBA's own feed, cdn.nba.com, but that feed turns
  away GitHub's servers, so the daily update doesn't use it.)
- `build_players.py` -- writes `data/players/<id>.json`, one per player since 1973-74

Player pages also show: Play Eval rank, percentile and position rank; what drives their Play Eval (each
piece per minute vs. the league); recent form; splits; season and career highs; assisted vs. unassisted makes;
who they assist and who assists them; on/off impact (team point differential per 48 on vs. off the floor);
most similar players this season and all-time; and playoff numbers back to 1973-74 (Basketball-Reference
playoff totals, `data/playoffs-YYYY.json`). Compare any two players at `#/compare/<id>/<id>`.

Team colors and logos are in the `TEAMS` list at the top of `player.js`.
