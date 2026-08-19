/**
 * The PM MCP tool registry (pm-mcp). Every tool runs AS the OAuth grant's user
 * (`ctx.user`) — authz inside handlers must reuse the same lib functions the UI
 * routes use, so MCP can never do more than the user could in the browser.
 *
 * Ships `whoami` (a connection smoke test) + the Settings → AI models tools
 * (`tools-ai-models.ts`) + Sites tools (`tools-sites.ts`); more simply append.
 */
import type { User } from "@/db/schema";
import type { ToolRegistry } from "./mcp-core";
import { AI_MODEL_TOOLS } from "./tools-ai-models";
import { SITE_TOOLS } from "./tools-sites";

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
  ...AI_MODEL_TOOLS,
  ...SITE_TOOLS,
];
