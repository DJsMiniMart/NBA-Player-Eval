# Play Eval

A ranked list of every NBA player by Play Eval, updated automatically every morning:

    (Points + Assists x2 + Defensive Rebounds + Offensive Rebounds x2 + Steals x2 + Blocks) / Minutes

Season totals come from Basketball-Reference. A GitHub Action (`.github/workflows/update-stats.yml`)
runs `update_stats.py` once a day, saves the results to `data/stats.json` and `data/history.json`,
and the page (`index.html`) reads them.

- Change the stat's name or the default qualifying minimums at the top of the `<script>` in `index.html`.
- Every finished season back to 1973-74 is downloaded once (the first run takes about 5 minutes) and kept in
  `data/season-YYYY.json`; `data/alltime.json` holds every player-season for the all-time list and career charts.
  1973-74 is the first season the NBA tracked steals, blocks, and offensive/defensive rebounds.
- Change the update time with the `cron` line in the workflow (it's in UTC).
- To update right now: Actions tab -> "Update NBA stats" -> Run workflow.

## Player pages

Click the "Player page" button on any leaderboard row to open that player's page. Active players get their
current team's logo and colors, a This Season section and a Career to Date section. Retired players get the
NBA's colors, every team they played for, total career earnings, and a Career section.
Each morning the update also runs:

- `bbr_extra.py` -- bios (weekly), draft picks (once per draft), contracts (daily) and past salaries (each
  team-season page once, about 40 minutes' worth per run) from Basketball-Reference
- `nba_games.py` -- every game's box score and play-by-play from the NBA's public feed (cdn.nba.com):
  game logs, shot zones and locations, assist partners, steal types, block locations. It finishes this
  season's games, then backfills older seasons, newest first, until the feed runs out. Each run stops
  starting new games after 150 minutes; the rest is picked up the next morning.
- `build_players.py` -- writes `data/players/<id>.json`, one per player since 1973-74

Team colors and logos are in the `TEAMS` list at the top of `player.js`.
