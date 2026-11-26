#!/usr/bin/env bash
# Updates the existing bjtu-life nginx site using the site/ and service/ directories in the release bundle.
set -Eeuo pipefail
if [[ $EUID != 0 || $# != 1 ]]; then
  echo 'Usage: sudo bash install-npc-service.sh https://your-game-host' >&2
  exit 1
fi
origin=${1%/}
[[ "$origin" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || { echo 'Supply the public game origin.' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "$0")" && pwd)
site=/var/www/bjtu-life
api=/opt/bjtu-npc
conf=/etc/nginx/sites-available/bjtu-life
if grep -qxF '# bjtu-https-active' "$conf"; then
  origin=${origin/#http:\/\//https:\/\/}
fi
[[ -f "$conf" && -L "$site/current" && -f "$bundle/site/index.html" && -f "$bundle/site/playthrough.js" && -f "$bundle/service/scripts/npc-server.js" && -f "$bundle/service/scripts/playthrough-store.js" ]]
node_bin=$(command -v node) || { echo 'Install Node.js 24 first.' >&2; exit 1; }
"$node_bin" -e "require('node:sqlite'); if (+process.versions.node.split('.')[0] < 24) process.exit(1)" || { echo 'Install Node.js 24 first.' >&2; exit 1; }
if ! id -u bjtu-npc >/dev/null 2>&1; then useradd --system --home-dir /var/lib/bjtu-npc --shell /usr/sbin/nologin bjtu-npc; fi
install -d -m 700 -o bjtu-npc -g "$(id -gn bjtu-npc)" /var/lib/bjtu-npc
install -d -m 755 "$api/releases" "$site/releases"
api_release=$(mktemp -d "$api/releases/release.XXXXXX")
web_release=$(mktemp -d "$site/releases/release.XXXXXX")
chmod 755 "$api_release" "$web_release"
cp -R "$bundle/service/." "$api_release/"
cp -R "$bundle/site/." "$web_release/"
# The service can also use Node installed under the administrator's home directory.
install -m 755 "$node_bin" "$api_release/node"
if [[ ! -e /etc/bjtu-npc.env ]]; then
  install -m 600 /dev/null /etc/bjtu-npc.env
  echo 'DEEPSEEK_API_KEY=' > /etc/bjtu-npc.env
fi
unit=/etc/systemd/system/bjtu-npc.service
backup=$(mktemp -d /var/backups/bjtu-npc.XXXXXX)
cp -p "$conf" "$backup/nginx"
[[ ! -e "$unit" ]] || cp -p "$unit" "$backup/unit"
old_api=$(readlink -f "$api/current" || true)
old_site=$(readlink -f "$site/current")
rollback() {
  local failed_line=$1
  echo "Update failed at line $failed_line. Restoring the previous release." >&2
  trap - ERR
  set +e
  cp -p "$backup/nginx" "$conf"
  ln -sfnT "$old_site" "$site/current"
  if [[ -f "$backup/unit" ]]; then
    cp -p "$backup/unit" "$unit"
    ln -sfnT "$old_api" "$api/current"
    systemctl daemon-reload && systemctl restart bjtu-npc
  else
    systemctl disable --now bjtu-npc
    rm -f "$unit" "$api/current"
    systemctl daemon-reload
  fi
  nginx -t && systemctl reload nginx
  echo "Update failed. Previous site restored. Backup: $backup" >&2
  exit 1
}
trap 'rollback "$LINENO"' ERR
cat > "$unit" <<UNIT
[Unit]
Description=BJTU Life NPC chat
After=network.target
[Service]
User=bjtu-npc
WorkingDirectory=$api/current
EnvironmentFile=/etc/bjtu-npc.env
Environment=NPC_DB=/var/lib/bjtu-npc/accounts.sqlite
Environment=NPC_PORT=8787
Environment=NPC_TRUST_PROXY=1
Environment=NPC_ORIGIN=$origin
ExecStart=$api/current/node $api/current/scripts/npc-server.js
Restart=on-failure
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/bjtu-npc
[Install]
WantedBy=multi-user.target
UNIT
python3 - "$conf" <<'PY'
from pathlib import Path
import re, sys
conf = Path(sys.argv[1])
old = conf.read_text()
marker = '# bjtu-npc-api'
if marker not in old:
    block = '''
    # bjtu-npc-api
    location ^~ /api/npc- {
        client_max_body_size 32k;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_pass http://127.0.0.1:8787;
    }'''
    updated, count = re.subn(r'(?m)^\s*root\s+/var/www/bjtu-life/current/?;', lambda m: m[0] + '\n' + block, old)
    if not count:
        sys.exit('Cannot find bjtu-life site root in nginx config.')
    old = updated
if 'location = /api/playthroughs {' not in old:
    archive_location = '''location = /api/playthroughs {
        client_max_body_size 2m;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_pass http://127.0.0.1:8787;
    }
    '''
    old = old.replace(marker, archive_location + marker)
conf.write_text(old)
PY
nginx -t
ln -sfnT "$api_release" "$api/current"
systemctl daemon-reload
systemctl enable bjtu-npc
systemctl restart bjtu-npc
wait_for_http() {
  local label=$1 expected=$2 status attempt
  shift 2
  for attempt in {1..40}; do
    if status=$(curl --silent --noproxy '*' --connect-timeout 1 --max-time 3 \
        --output /dev/null --write-out '%{http_code}' "$@") && [[ $status == "$expected" ]]; then
      echo "$label ready (HTTP $status, attempt $attempt)."
      return 0
    fi
    sleep 0.25
  done
  echo "$label failed: expected HTTP $expected, last HTTP ${status:-000}." >&2
  return 1
}
local_api=http://127.0.0.1:8787
# The empty object checks validation without inserting test records.
probe=(--header 'Content-Type: application/json' --data '{}')
wait_for_http 'Account service' 401 "$local_api/api/npc-account/session"
wait_for_http 'Save service' 400 "${probe[@]}" "$local_api/api/playthroughs"
"$api_release/node" - /var/lib/bjtu-npc/playthroughs.sqlite <<'JS'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2], {readOnly: true});
db.prepare('SELECT s.run_id, f.suggestion FROM game_saves s JOIN game_feedback_entries f ON s.run_id=f.run_id AND s.snapshot_id=f.snapshot_id LIMIT 0').all();
db.close();
console.log('Production database ready: game_saves and game_feedback_entries.');
JS
host_port=$("$node_bin" -p "const u=new URL(process.argv[1]); u.hostname+':'+(u.port || (u.protocol==='https:'?'443':'80'))" "$origin")
proxy=(--resolve "$host_port:127.0.0.1")
systemctl reload nginx
# Nginx can report a successful reload while old workers still serve the previous routes.
wait_for_http 'Account route' 401 "${proxy[@]}" "$origin/api/npc-account/session"
# Exercise guest session routing without creating an identity or spending model quota.
wait_for_http 'Guest session route' 400 "${proxy[@]}" --header 'Content-Type: application/json' --data 'null' "$origin/api/npc-account/session"
wait_for_http 'Save route' 400 "${proxy[@]}" "${probe[@]}" "$origin/api/playthroughs"
ln -sfnT "$web_release" "$site/current"
trap - ERR
echo "Installed. Add DEEPSEEK_API_KEY to /etc/bjtu-npc.env and restart bjtu-npc if the key is new."
