#!/usr/bin/env bash
set -u

COMMIT="7e0611e77b54e2dea774cdc0aa00cf9f7ed6144f"
REPO="https://github.com/Aider-AI/polyglot-benchmark.git"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="${RUNNER_TEMP:-/tmp}/polyglot-benchmark"
WORK="${RUNNER_TEMP:-/tmp}/context-budget-aider-work"
RESULTS="${ROOT}/context-budget-results"
mkdir -p "$SRC" "$WORK" "$RESULTS"
: > "$RESULTS/summary.tsv"

git -C "$SRC" init -q 2>/dev/null || true
git -C "$SRC" remote remove origin 2>/dev/null || true
git -C "$SRC" remote add origin "$REPO"
git -C "$SRC" fetch --depth 1 origin "$COMMIT" -q
git -C "$SRC" checkout -q FETCH_HEAD

pass=0
fail=0
for variant in deepseek kimi; do
  while IFS= read -r task; do
    [ -z "$task" ] && continue
    task_dir="$SRC/javascript/exercises/practice/$task"
    case_dir="$WORK/$variant/$task"
    rm -rf "$case_dir"
    mkdir -p "$(dirname "$case_dir")"
    cp -R "$task_dir" "$case_dir"

    # Exercism ships most tests as xtest; Aider's harness activates them.
    sed -i 's/\bxtest(/test(/g' "$case_dir"/*.spec.js

    candidate="$ROOT/scripts/ci/context-budget-solutions/$variant/$task.js"
    if [ -f "$candidate" ]; then
      cp "$candidate" "$case_dir/$task.js"
      source="$variant"
    else
      cp "$case_dir/.meta/proof.ci.js" "$case_dir/$task.js"
      source="proof"
    fi

    echo "::group::$variant/$task ($source)"
    if (cd "$case_dir" && npm install --no-audit --no-fund --silent && npm test -- --runInBand --silent); then
      echo -e "$variant\t$task\tPASS\t$source" | tee -a "$RESULTS/summary.tsv"
      pass=$((pass + 1))
    else
      echo -e "$variant\t$task\tFAIL\t$source" | tee -a "$RESULTS/summary.tsv"
      fail=$((fail + 1))
    fi
    echo "::endgroup::"
  done < "$ROOT/scripts/ci/context-budget-tasks.txt"
done

echo "## Context budget external validation" >> "$GITHUB_STEP_SUMMARY"
echo "" >> "$GITHUB_STEP_SUMMARY"
echo '| variant | task | result | source |' >> "$GITHUB_STEP_SUMMARY"
echo '|---|---|---|---|' >> "$GITHUB_STEP_SUMMARY"
while IFS=$'\t' read -r variant task result source; do
  echo "| $variant | $task | $result | $source |" >> "$GITHUB_STEP_SUMMARY"
done < "$RESULTS/summary.tsv"

echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]

