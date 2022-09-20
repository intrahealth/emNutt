#!/usr/bin/env bash
set -ex

# automate tagging with the short commit hash
docker build --no-cache -t intrahealth/emnutt:$(git rev-parse --short HEAD) .
docker tag intrahealth/emnutt:$(git rev-parse --short HEAD) intrahealth/emnutt
docker push intrahealth/emnutt:$(git rev-parse --short HEAD)
docker push intrahealth/emnutt:latest