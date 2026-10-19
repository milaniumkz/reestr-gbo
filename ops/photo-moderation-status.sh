#!/usr/bin/env bash
set -euo pipefail
ssh "${DEPLOY_USER:-root}@${DEPLOY_HOST:?DEPLOY_HOST required}" 'cd /opt/reestr/app/backend && node -e '\''require("dotenv").config({quiet:true}); const {PhotoModerationService}=require("./dist/src/photo-moderation/photo-moderation.service"); console.log(JSON.stringify(new PhotoModerationService().status()));'\'''
