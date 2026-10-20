#!/usr/bin/env bash
# 전체 테스트를 직렬로 실행하고 요약을 출력합니다 (무거운 Playwright 테스트를 병렬로 돌리면 swiftshader 가 느려져 타임아웃이 남).
#   bash tests/run_all.sh            # node + regress + 모든 Playwright 스위트 + schema_pg
#   bash tests/run_all.sh equip shop # 이름을 주면 해당 스위트만 (node 테스트는 항상 실행)
# regress.py 는 알려진 차이 4개(KNOWN_DIFFS)까지 OK 로 봅니다. 로그: tests/logs/<이름>.log
cd "$(dirname "$0")/.." || exit 1
SUITES=(account equip unique items_ui advance lazy waveprev speed chestall shop rose budeul legend clicks tower stages tablet gfx sync paths warp monsters roster flicker bossblack snowvis volcanovis ruinsvis)
[ $# -gt 0 ] && SUITES=("$@")
KNOWN_DIFFS=4
mkdir -p tests/logs; declare -a SUM; fail=0; T0=$SECONDS
note() { SUM+=("$1"); echo "$1"; }
for f in tests/*.test.mjs; do n=$(basename "$f" .test.mjs)
  if node "$f" > "tests/logs/node_$n.log" 2>&1; then note "OK    node $n"; else note "FAIL  node $n (tests/logs/node_$n.log)"; fail=1; fi; done
if [ $# -eq 0 ] || [[ " $* " == *" regress "* ]]; then
  t=$SECONDS; python3 tests/regress.py > tests/logs/regress.log 2>&1
  d=$(grep -c '^  DIFF' tests/logs/regress.log); ce=$(grep -o 'console errors: [0-9]*' tests/logs/regress.log | grep -o '[0-9]*$')
  if [ "${ce:-1}" = 0 ] && [ "$d" -le $KNOWN_DIFFS ]; then note "OK    regress ($d known diffs, $((SECONDS-t))s)"; else note "FAIL  regress ($d diffs, console errors ${ce:-?})"; fail=1; fi
fi
for s in "${SUITES[@]}"; do case "$s" in regress|schema_pg) continue;; esac; [ -f "tests/$s.py" ] || { note "SKIP  $s (없음)"; continue; }
  t=$SECONDS; timeout 1500 python3 "tests/$s.py" > "tests/logs/$s.log" 2>&1; rc=$?
  nok=$(grep -c '^OK ' "tests/logs/$s.log"); nf=$(grep -c '^FAIL' "tests/logs/$s.log")
  if [ $rc -eq 0 ] && grep -q '^SKIP' "tests/logs/$s.log"; then note "SKIP  $s ($(grep -m1 '^SKIP' "tests/logs/$s.log" | cut -c1-70))"; elif [ $rc -eq 0 ]; then note "OK    $s ($nok ok, $((SECONDS-t))s)"; else note "FAIL  $s (rc=$rc, $nok ok / $nf fail, $((SECONDS-t))s): $(grep '^FAIL' "tests/logs/$s.log" | head -3 | cut -c1-80 | tr '\n' ';')"; fail=1; fi
done
if [ $# -eq 0 ] || [[ " $* " == *" schema_pg "* ]]; then
  python3 tests/schema_pg.py > tests/logs/schema_pg.log 2>&1 && note "OK    schema_pg ($(grep -c '^OK ' tests/logs/schema_pg.log) ok$(grep -q SKIP tests/logs/schema_pg.log && echo ', SKIP: postgres 없음'))" || { note "FAIL  schema_pg"; fail=1; }
fi
echo; echo "===== 요약 ($((SECONDS-T0))s) ====="; printf '%s\n' "${SUM[@]}"; echo; [ $fail = 0 ] && echo "ALL OK" || echo "FAILED"; exit $fail
