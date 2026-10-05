#!/usr/bin/env bash
# remote-e2e.sh — run scripts/e2e.mjs ON the box that hosts the shared dev
# databases, not here.
#
# WHY REMOTE. The databases are on a box ~240 ms away. A server run here
# makes every statement a round trip through an SSH tunnel, and a fresh
# migration is thousands of statements: half an hour. On the box itself the
# same work is local. So the source goes there, is built there (golang
# container, CGO off), and the server, the mock upstream and the CLI under
# test all run there; this script only ships the code and streams the result.
#
#   scripts/remote-e2e.sh            # reuse the migrated schema when main has not moved
#   scripts/remote-e2e.sh --fresh    # drop and recreate this prefix's databases first
#
# Env: ORCA_E2E_SSH (default pr), ORCA_E2E_REMOTE_DIR (default /data/cli_e2e),
# ORCA_O2_REPO (default ../../OrcaRouter-O2 from cli/), ORCA_O2_REF (default
# origin/main), ORCA_E2E_MYSQL_CONTAINER / ORCA_E2E_REDIS_CONTAINER (default
# orcarouter-mysql / orcarouter-redis), DEV_PORT / DEV_MOCK_PORT (3120/3121).
set -euo pipefail
CLI_DIR=$(cd "$(dirname "$0")/.." && pwd)
HOST=${ORCA_E2E_SSH:-pr}
DIR=${ORCA_E2E_REMOTE_DIR:-/data/cli_e2e}
O2=${ORCA_O2_REPO:-$CLI_DIR/../../OrcaRouter-O2}
REF=${ORCA_O2_REF:-origin/main}
MYSQL_C=${ORCA_E2E_MYSQL_CONTAINER:-orcarouter-mysql}
REDIS_C=${ORCA_E2E_REDIS_CONTAINER:-orcarouter-redis}
PORT=${DEV_PORT:-3120}
MOCK_PORT=${DEV_MOCK_PORT:-3121}

case "$REF" in origin/*) git -C "$O2" fetch -q origin ;; esac
REV=$(git -C "$O2" rev-parse --short "$REF")

# The O2 source is shipped only when the revision moved: it is ~100 MB.
# git archive, not rsync: it carries exactly the committed tree, and a macOS
# tar would add ._* files that break the server's own source-scanning tests.
if [ "$(ssh "$HOST" "cat $DIR/o2.rev 2>/dev/null" || true)" != "$REV" ]; then
  echo "shipping OrcaRouter $REF ($REV) to $HOST:$DIR/o2 …"
  ssh "$HOST" "mkdir -p $DIR/o2 && find $DIR/o2 -mindepth 1 -delete"
  git -C "$O2" archive "$REF" | ssh "$HOST" "tar -x -C $DIR/o2"
  echo "$REV" | ssh "$HOST" "cat > $DIR/o2.rev"
fi
rsync -a --delete --exclude .dev --exclude node_modules "$CLI_DIR/" "$HOST:$DIR/cli/"

ssh "$HOST" bash -s -- "$@" <<REMOTE
set -euo pipefail
cd $DIR
mkdir -p o2/web/dist o2/cmd/orca-cli-e2e-seed gocache gomod bin
# main.go embeds web/dist (a build output, not in git); the API under test
# never serves it, so a placeholder page is enough to compile.
test -f o2/web/dist/index.html || echo '<!doctype html><title>e2e</title>' > o2/web/dist/index.html
cp cli/scripts/e2e-seed.go o2/cmd/orca-cli-e2e-seed/main.go
echo "building server + seed ($REV) …"
docker run --rm -v $DIR/o2:/src -v $DIR/gocache:/gocache -v $DIR/gomod:/go/pkg/mod -v $DIR/bin:/out \
  -e GOPROXY=https://goproxy.cn,direct -e GOCACHE=/gocache -e CGO_ENABLED=0 -w /src golang:1.26.1-bookworm \
  sh -c 'go build -o /out/orcarouter . && go build -o /out/seed ./cmd/orca-cli-e2e-seed'
cd cli
ORCA_E2E_PREBUILT=1 ORCA_E2E_BIN=$DIR/bin/orcarouter ORCA_E2E_SEED_BIN=$DIR/bin/seed ORCA_E2E_REV=$REV \
ORCA_E2E_MYSQL_CONTAINER=$MYSQL_C ORCA_E2E_REDIS_CONTAINER=$REDIS_C DEV_PORT=$PORT DEV_MOCK_PORT=$MOCK_PORT \
  node scripts/e2e.mjs "\$@"
REMOTE
