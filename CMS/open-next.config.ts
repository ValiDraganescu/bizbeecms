import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// ponytail: explicit "dummy" no-op caches so the built worker exports NO Durable
// Object classes (DOQueueHandler/DOShardedTagCache/BucketCachePurge). The PM deploy
// uploads this bundle via the Workers Script-Upload API, which sends no
// durable_objects/migrations metadata — exporting DOs would make Cloudflare reject
// the upload. The milestone CMS is the default Next install and needs no incremental
// cache, so dummy is correct here. Upgrade path: if real cache is ever needed, wire
// the DO-backed overrides AND declare durable_objects.bindings + migrations in
// src/lib/deploy/script-upload.ts's buildScriptUploadForm.
export default defineCloudflareConfig({
  incrementalCache: "dummy",
  tagCache: "dummy",
  queue: "dummy",
  cachePurge: "dummy",
});
