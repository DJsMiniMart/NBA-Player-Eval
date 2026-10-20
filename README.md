# Play Eval

A ranked list of every NBA player by Play Eval, updated automatically every morning:

    (Points + Assists x2 + Defensive Rebounds + Offensive Rebounds x2 + Steals x4 + Blocks) / Minutes

Season totals come from Basketball-Reference. A GitHub Action (`.github/workflows/update-stats.yml`)
runs `update_stats.py` once a day, saves the results to `data/stats.json` and `data/history.json`,
and the page (`index.html`) reads them.

- Change the stat's name or the default qualifying minimums at the top of the `<script>` in `index.html`.
- Past seasons kept as a baseline are listed in `PAST_SEASONS` in `update_stats.py` (by the year they ended).
- Change the update time with the `cron` line in the workflow (it's in UTC).
- To update right now: Actions tab -> "Update NBA stats" -> Run workflow.
