#!/usr/bin/env python3
"""Enable an automatically renewed IP certificate on the existing BJTU Nginx site."""
import argparse
import contextlib
import fcntl
import ipaddress
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

SITE = Path('/etc/nginx/sites-available/bjtu-life')
WEBROOT = Path('/var/www/bjtu-acme')
CERT_NAME = 'bjtu-life-ip'
LINEAGE = Path('/etc/letsencrypt/live') / CERT_NAME
PROBE = '/.well-known/bjtu-https-ready'
PENDING = '# bjtu-https-preview'
LIVE = '# bjtu-https-active'
CHALLENGE = """    location ^~ /.well-known/acme-challenge/ {
        root /var/www/bjtu-acme;
        default_type text/plain;
        try_files $uri =404;
    }"""
DROPIN = Path('/etc/systemd/system/bjtu-npc.service.d/60-bjtu-https.conf')
HOOK = Path('/etc/letsencrypt/renewal-hooks/deploy/60-bjtu-nginx')

def run(*args):
    subprocess.run(args, check=True)

def write(path, data, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as out:
            out.write(data)
        os.chmod(name, mode)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)

def reload_nginx():
    run('nginx', '-t')
    run('systemctl', 'reload', 'nginx')

def old_site(conf, ip):
    # A preview is appended to the original HTTP site. Preserve the game's live routes.
    conf = conf.split('\n' + PENDING + '\n', 1)[0]
    if (LIVE in conf or len(re.findall(r'(?m)^\s*server\s*\{', conf)) != 1
            or not re.search(r'(?m)^\s*server_name\s+' + re.escape(ip) + r'\s*;', conf)
            or not re.search(r'(?m)^\s*root\s+/var/www/bjtu-life/current/?;', conf)):
        raise ValueError('Unexpected Nginx site; check its server_name and current root.')
    return conf

def tls_lines():
    return (f'    listen 443 ssl;\n    listen [::]:443 ssl;\n'
            f'    ssl_certificate {LINEAGE}/fullchain.pem;\n'
            f'    ssl_certificate_key {LINEAGE}/privkey.pem;\n'
            '    ssl_protocols TLSv1.2 TLSv1.3;')

def challenge_site(base):
    if CHALLENGE in base:
        return base
    return base.replace('server {', 'server {\n' + CHALLENGE, 1)

def preview_site(base, ip):
    return challenge_site(base).rstrip() + '\n\n' + PENDING + f"""
server {{
{tls_lines()}
    server_name {ip};
    location = {PROBE} {{ default_type text/plain; return 200 "bjtu-https-ready"; }}
    location / {{ return 503; }}
}}
"""

def final_site(base, ip):
    # Only the HTTP server has the ACME webroot. Plaintext API requests never reach Node.
    secure = base.replace(CHALLENGE + '\n', '')
    secure, n4 = re.subn(r'(?m)^\s*listen 80;', '\n' + tls_lines(), secure)
    secure, n6 = re.subn(r'(?m)^\s*listen \[::\]:80;\n', '\n', secure)
    if (n4, n6) != (1, 1):
        raise ValueError('Unexpected HTTP listen directives.')
    return LIVE + f"""
server {{
    listen 80;
    listen [::]:80;
    server_name {ip};
{CHALLENGE}
    location ^~ /api/ {{ return 403; }}
    location / {{ return 308 https://{ip}$request_uri; }}
}}

""" + secure

def probe(ip, scheme, path, status, *, method='GET', body=None):
    # Use the system CA store; curl verifies the IP SAN even on this loopback test.
    port = 443 if scheme == 'https' else 80
    args = ['curl', '--silent', '--show-error', '--noproxy', '*', '--max-time', '4',
            '--resolve', f'{ip}:{port}:127.0.0.1', '--output', '/dev/null', '--write-out', '%{http_code}',
            '--request', method]
    if body is not None:
        args += ['--header', 'Content-Type: application/json', '--data', body]
    for _ in range(30):
        res = subprocess.run(args + [f'{scheme}://{ip}{path}'], capture_output=True, text=True)
        if res.returncode == 0 and res.stdout == str(status):
            return
        time.sleep(.25)
    raise RuntimeError(f'{scheme} {path}: expected {status}, got {res.stdout} {res.stderr.strip()}')

@contextlib.contextmanager
def rollback_on_failure(paths, restart_api=False):
    backup = Path(tempfile.mkdtemp(prefix='bjtu-https-', dir='/var/backups'))
    print('Configuration backup:', backup, flush=True)
    originals = {}
    for path in paths:
        if path.exists():
            saved = backup / path.name
            shutil.copy2(path, saved)
            originals[path] = saved
        else:
            originals[path] = None
    try:
        yield
    except BaseException:
        for path, saved in originals.items():
            if saved is None:
                path.unlink(missing_ok=True)
            else:
                write(path, saved.read_text(), saved.stat().st_mode & 0o777)
        if restart_api:
            run('systemctl', 'daemon-reload')
            run('systemctl', 'restart', 'bjtu-npc')
        reload_nginx()
        print('Previous site restored.', file=sys.stderr)
        raise

def prepare(ip):
    current = SITE.read_text()
    if current.startswith(LIVE):
        verify(ip)
        return
    base = old_site(current, ip)
    certbot = Path('/snap/bin/certbot')
    if not certbot.exists():
        run('snap', 'install', '--classic', 'certbot')
    version = subprocess.check_output([certbot, '--version'], text=True)
    major, minor = re.search(r'(\d+)\.(\d+)', version).groups()
    if (int(major), int(minor)) < (5, 4):
        run('snap', 'refresh', 'certbot', '--channel=latest/stable')
    for directory in (WEBROOT, WEBROOT / '.well-known', WEBROOT / '.well-known/acme-challenge'):
        directory.mkdir(exist_ok=True)
        directory.chmod(0o755)
    # The entire site must still work over HTTP throughout certificate provisioning.
    with rollback_on_failure([SITE]):
        write(SITE, challenge_site(base))
        reload_nginx()
        with tempfile.NamedTemporaryFile(dir=WEBROOT / '.well-known/acme-challenge', prefix='test-') as f:
            os.chmod(f.name, 0o644)
            probe(ip, 'http', '/.well-known/acme-challenge/' + Path(f.name).name, 200)
        run(certbot, 'certonly', '--non-interactive', '--agree-tos', '--register-unsafely-without-email',
            '--cert-name', CERT_NAME, '--preferred-profile', 'shortlived', '--webroot',
            '--webroot-path', str(WEBROOT), '--ip-address', ip, '--keep-until-expiring')
        write(HOOK, '#!/bin/sh\nset -eu\n[ "$RENEWED_LINEAGE" = "' + str(LINEAGE)
              + '" ] || exit 0\n/usr/sbin/nginx -t\n/usr/bin/systemctl reload nginx\n', 0o755)
        run('systemctl', 'start', 'snap.certbot.renew.timer')
        run('systemctl', 'is-active', 'snap.certbot.renew.timer')
        write(SITE, preview_site(base, ip))
        reload_nginx()
        probe(ip, 'https', PROBE, 200)
        probe(ip, 'http', '/', 200)
    print(f'PREPARED. Verify https://{ip}{PROBE} externally before enabling.')

def verify(ip):
    probe(ip, 'https', '/release.json', 200)
    probe(ip, 'https', '/api/npc-account/session', 401)
    probe(ip, 'https', '/api/npc-account/session', 400, method='POST', body='null')
    probe(ip, 'https', '/api/playthroughs', 400, method='POST', body='{}')
    probe(ip, 'http', '/', 308)
    probe(ip, 'http', '/api/npc-chat', 403, method='POST', body='{}')
    run('systemctl', 'is-active', 'snap.certbot.renew.timer')

def enable(ip):
    current = SITE.read_text()
    if current.startswith(LIVE):
        verify(ip)
        return
    if PENDING not in current:
        raise ValueError('Complete prepare and verify public port 443 first.')
    base = old_site(current, ip)
    probe(ip, 'https', PROBE, 200)
    with rollback_on_failure([SITE, DROPIN], restart_api=True):
        # Close the plaintext API before replacing any potentially exposed sessions.
        write(SITE, final_site(base, ip))
        reload_nginx()
        probe(ip, 'http', '/api/npc-chat', 403, method='POST', body='{}')
        run('systemctl', 'stop', 'bjtu-npc')
        run('runuser', '-u', 'bjtu-npc', '--', '/usr/bin/python3', '-c',
            "import sqlite3; db=sqlite3.connect('file:/var/lib/bjtu-npc/accounts.sqlite?mode=rw',uri=True); "
            "db.execute('DELETE FROM sessions'); db.commit(); db.close()")
        write(DROPIN, f'[Service]\nEnvironment=NPC_ORIGIN=https://{ip}\n')
        run('systemctl', 'daemon-reload')
        run('systemctl', 'start', 'bjtu-npc')
        verify(ip)
    print(f'ENABLED. Game: https://{ip}/')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['prepare', 'enable'])
    parser.add_argument('ipv4', type=ipaddress.IPv4Address)
    args = parser.parse_args()
    if os.geteuid() != 0 or not args.ipv4.is_global:
        parser.error('Run as root with the public IPv4 address configured in the game site.')
    with open('/run/bjtu-https.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        (prepare if args.phase == 'prepare' else enable)(str(args.ipv4))
