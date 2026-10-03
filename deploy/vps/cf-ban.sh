#!/bin/bash
# Block or unblock one visitor address at Cloudflare (so fail2ban bans work for proxied visitors).
# Usage: quizspace-cf-ban ban <ip> [note]   |   quizspace-cf-ban unban <ip>
# The token (Account Firewall Access Rules: Write, nothing else) is in /etc/quizspace-cf.env, root only:
#   CF_ACCOUNT=<account id>
#   CF_TOKEN=<token>
set -u
. /etc/quizspace-cf.env
action=${1:-}; ip=${2:-}; note=${3:-fail2ban}
api="https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/firewall/access_rules/rules"
auth="Authorization: Bearer $CF_TOKEN"
[[ "$ip" =~ ^[0-9a-fA-F:.]+$ ]] || { echo "bad address" >&2; exit 2; }
case "$ip" in 127.*|10.*|192.168.*|::1|62.72.29.5) echo "refusing to block $ip" >&2; exit 0;; esac
target=ip; [[ "$ip" == *:* ]] && target=ip6
case "$action" in
  ban)
    curl -fsS -m 20 -X POST -H "$auth" -H 'Content-Type: application/json' "$api" \
      -d "{\"mode\":\"block\",\"configuration\":{\"target\":\"$target\",\"value\":\"$ip\"},\"notes\":\"$note\"}" >/dev/null || exit 1 ;;
  unban)
    ids=$(curl -fsS -m 20 -H "$auth" "$api?mode=block&configuration.target=$target&configuration.value=$ip&per_page=50" \
      | python3 -c 'import sys,json; [print(r["id"]) for r in json.load(sys.stdin)["result"]]') || exit 1
    for id in $ids; do curl -fsS -m 20 -X DELETE -H "$auth" "$api/$id" >/dev/null || exit 1; done ;;
  *) echo "usage: $0 ban|unban <ip> [note]" >&2; exit 2 ;;
esac
