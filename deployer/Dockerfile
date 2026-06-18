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
# SHA256 of the official tarballs for NODE_VERSION (from nodejs.org/dist/vX/SHASUMS256.txt).
# Verified before extraction so a tampered/MITM'd download can't poison the build
# toolchain that ships customers' sites. Update BOTH when bumping NODE_VERSION.
ENV NODE_VERSION=22.14.0
ENV NODE_SHA256_x64=69b09dba5c8dcb05c4e4273a4340db1005abeafe3927efda2bc5b249e80437ec
ENV NODE_SHA256_arm64=08bfbf538bad0e8cbb0269f0173cca28d705874a67a22f60b57d99dc99e30050
RUN ARCH="$(dpkg --print-architecture)" \
  && case "$ARCH" in \
       amd64) NODE_ARCH=x64;   NODE_SHA="$NODE_SHA256_x64" ;; \
       arm64) NODE_ARCH=arm64; NODE_SHA="$NODE_SHA256_arm64" ;; \
       *) echo "unsupported arch $ARCH" && exit 1 ;; \
     esac \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -o /tmp/node.tar.xz \
  && echo "${NODE_SHA}  /tmp/node.tar.xz" | sha256sum -c - \
  && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
  && rm /tmp/node.tar.xz \
  && node --version

# wrangler + the OpenNext Cloudflare adapter, global so the build script can call
# them directly. Pinned to the versions both apps use.
RUN npm install -g wrangler@4 @opennextjs/cloudflare@1

# Required by the Sandbox runtime for local port exposure / health.
EXPOSE 8080
