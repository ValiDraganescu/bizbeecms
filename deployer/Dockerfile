# Sandbox base image (matches @cloudflare/sandbox 0.12.x). Ships Node.js 20 +
# a shell + common tools; we add git (to clone the repo) and wrangler (to run
# the real opennextjs-cloudflare build + deploy of a per-Site CMS Worker).
FROM docker.io/cloudflare/sandbox:0.12.1

# git for cloning the source at deploy time; ca-certificates for HTTPS clones.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# wrangler + the OpenNext Cloudflare adapter, global so the build script can call
# them directly. Pinned to the versions both apps use.
RUN npm install -g wrangler@4 @opennextjs/cloudflare@1

# Required by the Sandbox runtime for local port exposure / health.
EXPOSE 8080
