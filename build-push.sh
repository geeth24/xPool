#!/bin/bash

set -e

REGISTRY="registry.rsft.co"
SERVER_IMAGE="${REGISTRY}/xpool-server:latest"
CLIENT_IMAGE="${REGISTRY}/xpool-client:latest"

echo "Building and pushing images for AMD64..."

echo "Building server image..."
docker buildx build --platform linux/amd64 -f ./server/Dockerfile.prod -t ${SERVER_IMAGE} --push ./server

echo "Building client image..."
docker buildx build --platform linux/amd64 -f ./client/Dockerfile.prod -t ${CLIENT_IMAGE} --build-arg NEXT_PUBLIC_API_URL=https://api.xpool.geeth.app --push ./client

echo "Done! Images pushed:"
echo "  - ${SERVER_IMAGE}"
echo "  - ${CLIENT_IMAGE}"
