#!/bin/sh
# Builds the real QuestFit app into ./app for the "try it live" phone on the site, plus a demo campaign to start from.
# app/ is generated (and git-ignored): rerun this after app changes and before deploying.
set -e
SITE="$(cd "$(dirname "$0")/.." && pwd)"
APP="${QUESTFIT_APP:-$HOME/Projects/questfit}"
cd "$APP"
npx vite build --base ./ --outDir "$SITE/app" --emptyOutDir --logLevel warn
node --input-type=module -e "
import { createState } from '$APP/game.js';
const s = createState({ name: 'Aria', className: 'warrior', fitnessLevel: 'capable', penaltyMode: 'balanced' });
process.stdout.write(JSON.stringify(s));
" > "$SITE/app/demo-state.json"
echo "Built $(du -sh "$SITE/app" | cut -f1) into $SITE/app"
