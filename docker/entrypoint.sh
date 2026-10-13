#!/bin/sh
set -e

# Run as the PUID/PGID Unraid expects (99:100 = nobody:users by default) so files in
# /config stay owned by the right user on the array.
PUID="${PUID:-99}"
PGID="${PGID:-100}"
umask "${UMASK:-022}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$FIXIT_DATA_DIR"
  chown -R "$PUID:$PGID" "$FIXIT_DATA_DIR"
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups "$@"
fi

exec "$@"
