#!/bin/bash
set -e
echo "Running Backend Tests..."
cd aura-os/src-tauri
cargo test

echo "Running Frontend Build..."
cd ..
npm run build

echo "All tests passed."
