# Sandbox base image (matches @cloudflare/sandbox 0.12.x). Ships Node.js 20 +
# a shell + common tools; we add git (to clone the repo) and wrangler (to run
# the real opennextjs-cloudflare build + deploy of a per-Site CMS Worker).
FROM docker.io/cloudflare/sandbox:0.12.1

# git for cloning the source at deploy time; ca-certificates for HTTPS clones.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates curl xz-utils \
  && rm -rf /var/lib/apt/lists/*

# Pin Node explicitly. The base image's Node drifts between sandbox releases
# (commented Node 20, but builds actually ran on 22.22.3) — an unpinned runtime
# means the build env changes under us. Install a fixed Node and put it first on
# PATH so `next build` / esbuild run on a known version every time. 22 is the
# current Active LTS; bump deliberately, not by base-image drift.
ENV NODE_VERSION=22.14.0
RUN ARCH="$(dpkg --print-architecture)" \
  && case "$ARCH" in amd64) NODE_ARCH=x64 ;; arm64) NODE_ARCH=arm64 ;; *) echo "unsupported arch $ARCH" && exit 1 ;; esac \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -o /tmp/node.tar.xz \
  && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
  && rm /tmp/node.tar.xz \
  && node --version

# wrangler + the OpenNext Cloudflare adapter, global so the build script can call
# them directly. Pinned to the versions both apps use.
RUN npm install -g wrangler@4 @opennextjs/cloudflare@1

# Required by the Sandbox runtime for local port exposure / health.
EXPOSE 8080
