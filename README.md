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
