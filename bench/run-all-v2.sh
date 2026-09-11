#!/usr/bin/env bash
# اجرای کل ماتریس بنچمارک و ذخیره در bench/results-v2
set -u
cd "$(dirname "$0")/.."
export LISTIA_DB="$(pwd)/server/data/bench.db"
mkdir -p bench/results-v2
D=${DUR:-20}

run() {
  local scenario=$1; local c=$2
  local out="bench/results-v2/${scenario}-${c}.json"
  echo "=== $scenario concurrency=$c duration=${D}s ==="
  node --no-warnings bench/load.mjs "$scenario" "$c" "$D" > "$out" 2>"bench/results-v2/${scenario}-${c}.err"
  node -e "const r=require('./$out');console.log('rps='+r.total_rps,'p50='+r.endpoints[0]?.p50,'p95='+r.endpoints[0]?.p95,'p99='+r.endpoints[0]?.p99,'codes='+JSON.stringify(r.status_codes),'errs='+JSON.stringify(r.errors),'elLagP99='+r.eventloop.lag_p99_ms)"
}

run health 50
run dashboard 50
run dashboard 150
run readMix 100
run readMix 250
run search 50
run search 150
run login 10
run login 50
run writeMix 50
run writeMix 150
run heavy 10
run adminUsers 5
run mix 100
run mix 250
run mix 500
run mix 1000
echo "=== ALL DONE ==="
