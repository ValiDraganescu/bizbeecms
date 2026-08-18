/**
 * The PM MCP tool registry (pm-mcp). Every tool runs AS the OAuth grant's user
 * (`ctx.user`) — authz inside handlers must reuse the same lib functions the UI
 * routes use, so MCP can never do more than the user could in the browser.
 *
 * Ships `whoami` (a connection smoke test); site/settings/deploy tools land in
 * the next slices and simply append to this array.
 */
import type { User } from "@/db/schema";
import type { ToolRegistry } from "./mcp-core";

export type ToolCtx = { user: User; grantId: string };

const NO_ARGS = { type: "object", properties: {}, additionalProperties: false } as const;

export const PM_TOOLS: ToolRegistry<ToolCtx> = [
  {
    name: "whoami",
    description:
      "Who am I acting as? Returns the ProjectManager user (email, role) that " +
      "authorized this MCP connection. Call it first to confirm the connection " +
      "works and to learn your role/permissions.",
    inputSchema: NO_ARGS,
    run: async (_args, ctx) => ({
      ok: true,
      user: { id: ctx.user.id, email: ctx.user.email, role: ctx.user.role },
    }),
  },
];
