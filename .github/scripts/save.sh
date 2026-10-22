#!/usr/bin/env bash
# Commit whatever changed under data/ and push it, retrying if something else was pushed meanwhile.
set -u
msg="${1:-Daily stats update}"
git config user.name "stats-bot"
git config user.email "stats-bot@users.noreply.github.com"
git add data/
git diff --cached --quiet && { echo "Nothing new to save"; exit 0; }
git commit -q -m "$msg"
# (-X theirs: when the same data file changed in both places, keep this run's copy.)
for i in 1 2 3 4 5; do
  git pull --rebase -X theirs -q origin "${GITHUB_REF_NAME}" || { git rebase --abort 2>/dev/null; git pull --no-rebase -X ours -q --no-edit origin "${GITHUB_REF_NAME}"; }
  git push -q origin "HEAD:${GITHUB_REF_NAME}" && { echo "Saved"; exit 0; }
  echo "Push failed (try $i); retrying"
  sleep $((i * 10))
done
exit 1
