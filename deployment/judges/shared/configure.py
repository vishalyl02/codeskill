#!/usr/bin/env python3
import pathlib, secrets, os
root=pathlib.Path('/opt/codeskill-judges/config')
root.mkdir(mode=0o700,exist_ok=True)
authpath=root/'auth-token'
if not authpath.exists():
    authpath.write_text(secrets.token_hex(32))
    authpath.chmod(0o600)
auth=authpath.read_text().strip()
conf=root/'judge0.conf'
if not conf.exists():
    conf.write_text('''POSTGRES_HOST=judge0-db
POSTGRES_PORT=5432
POSTGRES_DB=judge0
POSTGRES_USER=judge0
POSTGRES_PASSWORD=%s
REDIS_HOST=judge0-redis
REDIS_PORT=6379
REDIS_PASSWORD=%s
RAILS_MAX_THREADS=2
RAILS_SERVER_PROCESSES=1
COUNT=1
INTERVAL=0.2
MAX_QUEUE_SIZE=50
JUDGE0_TELEMETRY_ENABLE=false
ENABLE_WAIT_RESULT=false
ENABLE_COMPILER_OPTIONS=false
ENABLE_COMMAND_LINE_ARGUMENTS=false
ENABLE_BATCHED_SUBMISSIONS=false
ENABLE_CALLBACKS=false
ENABLE_ADDITIONAL_FILES=false
ALLOW_ENABLE_NETWORK=false
ENABLE_NETWORK=false
ALLOW_ENABLE_PER_PROCESS_AND_THREAD_TIME_LIMIT=false
ALLOW_ENABLE_PER_PROCESS_AND_THREAD_MEMORY_LIMIT=false
ENABLE_PER_PROCESS_AND_THREAD_TIME_LIMIT=false
ENABLE_PER_PROCESS_AND_THREAD_MEMORY_LIMIT=false
CPU_TIME_LIMIT=3
MAX_CPU_TIME_LIMIT=10
CPU_EXTRA_TIME=0
MAX_CPU_EXTRA_TIME=0
WALL_TIME_LIMIT=5
MAX_WALL_TIME_LIMIT=15
MEMORY_LIMIT=131072
MAX_MEMORY_LIMIT=262144
STACK_LIMIT=65536
MAX_STACK_LIMIT=65536
MAX_PROCESSES_AND_OR_THREADS=64
MAX_MAX_PROCESSES_AND_OR_THREADS=64
MAX_FILE_SIZE=64
MAX_MAX_FILE_SIZE=64
MAX_COMPILE_FILE_SIZE=1024
NUMBER_OF_RUNS=1
MAX_NUMBER_OF_RUNS=1
AUTHN_HEADER=X-Auth-Token
AUTHN_TOKEN=%s
''' % (secrets.token_hex(24),secrets.token_hex(24),auth))
    conf.chmod(0o600)
# Worker/API are UID1000 and read the mounted configuration; others cannot.
os.chown(conf,1000,1000)
(root/'nginx.conf').write_text('''events { worker_connections 128; }
http {
  access_log off;
  resolver 127.0.0.11 valid=5s ipv6=off;
  limit_req_zone $binary_remote_addr zone=judge_requests:1m rate=5r/s;
  server {
    listen 2358;
    client_max_body_size 2m;
    if ($http_x_auth_token != "%s") { return 401; }
    location ~ ^/(languages|submissions|workers)(/.*)?$ {
      limit_req zone=judge_requests burst=20 nodelay;
      set $upstream http://judge0-api:2358;
      proxy_pass $upstream;
      proxy_read_timeout 30s;
      proxy_next_upstream off;
    }
    location / { return 403; }
  }
  server {
    listen 2001;
    client_max_body_size 2m;
    if ($http_authorization != "Bearer %s") { return 401; }
    location ~ ^/api/v2/(runtimes|execute)$ {
      limit_req zone=judge_requests burst=20 nodelay;
      set $upstream http://piston:2000;
      proxy_pass $upstream;
      proxy_read_timeout 30s;
      proxy_next_upstream off;
    }
    location / { return 403; }
  }
}
''' % (auth,auth))
(root/'nginx.conf').chmod(0o600)
