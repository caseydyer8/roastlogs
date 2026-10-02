#!/usr/bin/env bash
# RoastLogs machine profile.
# Source this, do not execute it:   . .claude/hooks/machine-profile.sh
#
# Decided 2026-09-11 (Option A): visual regression runs in a Linux container on
# BOTH machines, so baselines are a single -linux.png set and neither machine is
# second-class. Deploy stays Mac-only because it needs the gitignored .env; a
# build made without it publishes a keyless bundle that locks both accounts out
# of the live site while still returning HTTP 200.
#
# Override when you need to force a profile:  RL_FORCE_MACHINE=windows claude

RL_OS_RAW="$(uname -s 2>/dev/null || echo unknown)"

case "$RL_OS_RAW" in
  Darwin)               RL_MACHINE="mac" ;;
  MINGW*|MSYS*|CYGWIN*) RL_MACHINE="windows" ;;   # Git Bash on the HP
  Linux)
    # WSL2 reports Linux but is really the HP. /proc/version names the kernel.
    if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; then
      RL_MACHINE="windows"
    else
      RL_MACHINE="container"                       # inside the Playwright image
    fi
    ;;
  *)                    RL_MACHINE="unknown" ;;
esac

[ -n "$RL_FORCE_MACHINE" ] && RL_MACHINE="$RL_FORCE_MACHINE"

# Docker has to be installed AND the daemon actually running. "installed" alone
# is a lie that only surfaces when the visual suite fails three steps later.
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    RL_DOCKER="up"
  else
    RL_DOCKER="installed-not-running"
  fi
else
  RL_DOCKER="absent"
fi

# Capabilities. Deliberately conservative: unknown machines get the floor.
case "$RL_MACHINE" in
  mac) RL_CAN_DEPLOY="yes" ;;
  *)   RL_CAN_DEPLOY="no"  ;;
esac

if [ "$RL_DOCKER" = "up" ]; then
  RL_VISUAL="container"
else
  RL_VISUAL="unavailable"
fi

RL_CAN_TEST_FUNCTIONAL="yes"

# Human-readable one-liner for the briefing.
RL_PROFILE_LINE="machine=${RL_MACHINE}  deploy=${RL_CAN_DEPLOY}  visual=${RL_VISUAL}  docker=${RL_DOCKER}"

export RL_MACHINE RL_DOCKER RL_CAN_DEPLOY RL_VISUAL RL_CAN_TEST_FUNCTIONAL RL_PROFILE_LINE
