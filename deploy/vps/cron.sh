#!/bin/bash
# Runs one of Quiz Space's daily jobs (they were Vercel crons): ./cron.sh /api/indexnow
set -euo pipefail
set -a; . /srv/quizspace/shared/.env.local; set +a
curl -fsS -m 300 -H "Authorization: Bearer ${CRON_SECRET}" "http://127.0.0.1:3100$1" >> /srv/quizspace/logs/cron.log 2>&1 && echo " [$(date -u +%FT%TZ)] $1 ok" >> /srv/quizspace/logs/cron.log
