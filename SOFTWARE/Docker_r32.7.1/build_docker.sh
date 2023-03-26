#!/bin/bash

# Get hardward compute capability
COMPUTE_CAPABILITY=$(nvidia-container-cli info | grep Architecture | grep -oe '\([0-9.]*\)')
BUILD_ARGS+=("--build-arg" "COMPUTE_CAPABILITY="$COMPUTE_CAPABILITY"")

# Mount additional plugins
# see: https://github.com/NVIDIA/libnvidia-container/blob/jetson/design/mount_plugins.md
#echo "lib, /usr/lib/aarch64-linux-gnu/libgstbadvideo-1.0.so" > /etc/nvidia-container-runtime/host-files-for-container.d/custom.csv

docker build -f ./Dockerfile.release \
    -t botank_r32.7.1 \
    "${BUILD_ARGS[@]}" \
    .
