#!/usr/bin/env bash
# Copies the newest server backup to this Mac, in a private folder, so a lost server does not lose the settings file.
# Run it now and then (the server keeps its own 14 nightly copies). Needs the key ~/.ssh/quizspace_vps.
set -euo pipefail
HOST="${VPS_HOST:-62.72.29.5}"; KEY="${VPS_KEY:-$HOME/.ssh/quizspace_vps}"; DEST="$HOME/.quizspace-vps-backups"
mkdir -p "$DEST"; chmod 700 "$DEST"
LATEST=$(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes "root@$HOST" 'ls -1t /srv/quizspace/backups/quizspace-config-*.tgz | head -1')
scp -i "$KEY" -o IdentitiesOnly=yes -q "root@$HOST:$LATEST" "$DEST/" && chmod 600 "$DEST/$(basename "$LATEST")"
echo "saved: $DEST/$(basename "$LATEST")"
