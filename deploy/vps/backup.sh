#!/bin/bash
# Nightly backup of everything that exists only on the server for Quiz Space (not the other project's files):
# the settings file, the Caddy, service, cron and fail2ban files. Installed as /usr/local/sbin/quizspace-backup,
# run by /etc/cron.d/quizspace-backup. Keeps 14 days in /srv/quizspace/backups (root only).
set -euo pipefail
DIR=/srv/quizspace/backups
mkdir -p "$DIR"; chmod 700 "$DIR"
OUT="$DIR/quizspace-config-$(date -u +%Y%m%d-%H%M).tgz"
tar -czf "$OUT" --ignore-failed-read \
  /srv/quizspace/shared/.env.local /srv/quizspace/cron.sh \
  /etc/caddy/quizspace.caddy \
  /etc/systemd/system/quizspace.service \
  /etc/cron.d/quizspace /etc/cron.d/quizspace-backup \
  /etc/fail2ban/jail.d/quizspace.local /etc/fail2ban/filter.d/quizspace-*.conf \
  /usr/local/sbin/quizspace-backup 2>/dev/null
chmod 600 "$OUT"
ls -1t "$DIR"/quizspace-config-*.tgz | tail -n +15 | xargs -r rm -f
echo "backup written: $OUT ($(du -h "$OUT" | cut -f1))"
