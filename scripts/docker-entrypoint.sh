#!/bin/sh
set -eu
npx prisma migrate deploy
npx prisma db seed
exec npx tsx server.ts
