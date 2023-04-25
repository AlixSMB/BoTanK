#!/bin/bash
export BOTANK_UID="$(id -u)"
export BOTANK_GID="$(id -g)"
export BOTANK_USER="$(id -nu)"
docker-compose -p botank_r3271-$BOTANK_USER up -d
