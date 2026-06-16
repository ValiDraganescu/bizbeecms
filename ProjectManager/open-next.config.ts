import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Incremental cache, queue, tag cache can be wired here later.
  // Defaults are fine for the PM hello-world milestone.
});
