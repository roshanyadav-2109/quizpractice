#!/usr/bin/env bash
# Deploys this repository's current commit (git HEAD, as pushed) to the VPS.
#
#   deploy/vps/deploy.sh            deploy HEAD
#   deploy/vps/deploy.sh rollback   go back to the previous release
#
# The new release is built beside the running one, in a cgroup capped at 1 CPU and 3 GB so the other site on
# the server is never starved. The site keeps serving the old release until the build has succeeded, then it
# switches, restarts the two copies of the app one after the other (A on 3100, then B on 3101, so one always
# answers) and checks the home page of each; if that fails it switches straight back.
# Needs the SSH key ~/.ssh/quizspace_vps (see docs/hosting-vps.md). Uncommitted changes are NOT deployed.
set -euo pipefail

HOST="${VPS_HOST:-62.72.29.5}"
KEY="${VPS_KEY:-$HOME/.ssh/quizspace_vps}"
ssh_() { ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes "root@$HOST" "$@"; }

if [ "${1:-}" = "rollback" ]; then
  ssh_ 'set -e; cd /srv/quizspace/releases
        cur=$(basename "$(readlink -f /srv/quizspace/current)")
        prev=$(ls -1t | grep -v "^$cur$" | head -1)
        [ -n "$prev" ] || { echo "no earlier release to go back to"; exit 1; }
        ln -sfn "/srv/quizspace/releases/$prev" /srv/quizspace/current && chown -h quiz:quiz /srv/quizspace/current
        systemctl restart quizspace && sleep 8 && systemctl restart quizspace-b && echo "rolled back from $cur to $prev"'
  exit 0
fi

cd "$(git rev-parse --show-toplevel)"
SHA=$(git rev-parse --short HEAD)
git diff --quiet HEAD -- || echo "warning: uncommitted changes are not part of this deploy"
echo "deploying $SHA: $(git log -1 --format=%s)"

ssh_ "[ -f /srv/quizspace/releases/$SHA/.built ]" 2>/dev/null && BUILT=1 || BUILT=0
if [ "$BUILT" = 0 ]; then
  git archive --format=tar HEAD | ssh_ "set -e; REL=/srv/quizspace/releases/$SHA; rm -rf \$REL; mkdir -p \$REL; tar -x -C \$REL; ln -sf /srv/quizspace/shared/.env.local \$REL/.env.local; chown -R quiz:quiz \$REL"
  ssh_ "systemd-run --wait --collect --pipe --unit=quizspace-build-$SHA -p User=quiz -p MemoryMax=3G -p CPUQuota=100% -p Nice=19 -p WorkingDirectory=/srv/quizspace/releases/$SHA -p Environment=HOME=/srv/quizspace -p Environment=NODE_OPTIONS=--max-old-space-size=2560 /bin/bash -c 'npm ci --no-audit --no-fund --loglevel=error && npm run build && touch .built'"
fi

ssh_ "set -e
  PREV=\$(readlink -f /srv/quizspace/current || true)
  ln -sfn /srv/quizspace/releases/$SHA /srv/quizspace/current && chown -h quiz:quiz /srv/quizspace/current
  for unit_port in quizspace:3100 quizspace-b:3101; do
    unit=\${unit_port%%:*}; port=\${unit_port##*:}
    systemctl restart \$unit
    for i in \$(seq 1 30); do
      code=\$(curl -s -o /dev/null -m 5 -w '%{http_code}' -H 'Host: quizspace.unknowniitians.com' http://127.0.0.1:\$port/ || true)
      [ \"\$code\" = 200 ] && { echo \"\$unit (port \$port) answers 200\"; break; }
      sleep 2
      if [ \$i = 30 ]; then
        echo \"the new release did not come up on \$unit: going back\"
        [ -n \"\$PREV\" ] && ln -sfn \"\$PREV\" /srv/quizspace/current && chown -h quiz:quiz /srv/quizspace/current && systemctl restart quizspace quizspace-b
        exit 1
      fi
    done
  done
  echo 'both copies answer 200: deploy ok'
  ls -1dt /srv/quizspace/releases/*/ | tail -n +4 | xargs -r rm -rf   # keep the newest three"
echo "live: https://quizspace.unknowniitians.com (release $SHA)"
