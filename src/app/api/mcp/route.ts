import { NextRequest, NextResponse } from "next/server";
import { authenticateToken } from "@/lib/api-tokens";
import { MCP_INSTRUCTIONS, TOOLS, ToolInputError } from "@/lib/mcp/tools";
import { guardRate } from "@/lib/api-utils";

/**
 * Banyan's MCP server: Model Context Protocol over Streamable HTTP (stateless,
 * JSON responses). Authenticate with a personal access token from Settings
 * ("Authorization: Bearer bny_…"). All tools are read-only.
 */

const VERSIONS = ["2025-06-18", "2025-03-26"];
const MAX_BODY = 64 * 1024;

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: { protocolVersion?: string; name?: string; arguments?: Record<string, unknown> } };

const reply = (id: Rpc["id"], body: { result?: unknown; error?: { code: number; message: string } }) =>
  NextResponse.json({ jsonrpc: "2.0", id: id ?? null, ...body });

export async function POST(req: NextRequest) {
  const limited = await guardRate(req, "mcp", 120, 60_000);
  if (limited) return limited;
  const ctx = await authenticateToken(req.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json({ error: "A valid Banyan access token is required (Settings → Connect an AI assistant)." }, { status: 401, headers: { "www-authenticate": "Bearer" } });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) return reply(null, { error: { code: -32600, message: "Request too large." } });
  let msg: Rpc;
  try {
    msg = JSON.parse(raw) as Rpc;
  } catch {
    return reply(null, { error: { code: -32700, message: "Parse error." } });
  }
  if (msg.jsonrpc !== "2.0" || !msg.method) return reply(msg.id, { error: { code: -32600, message: "Expected one JSON-RPC 2.0 request." } });
  if (msg.id === undefined || msg.id === null) return new NextResponse(null, { status: 202 }); // notification

  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      return reply(msg.id, {
        result: {
          protocolVersion: asked && VERSIONS.includes(asked) ? asked : VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "banyan", title: `Banyan — ${ctx.workspace.name}`, version: "1.0.0" },
          instructions: MCP_INSTRUCTIONS,
        },
      });
    }
    case "ping":
      return reply(msg.id, { result: {} });
    case "tools/list":
      return reply(msg.id, { result: { tools: TOOLS.map(({ run: _run, ...t }) => t) } });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return reply(msg.id, { error: { code: -32602, message: `Unknown tool: ${msg.params?.name ?? ""}` } });
      try {
        const data = await tool.run(ctx, msg.params?.arguments ?? {});
        return reply(msg.id, { result: { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data, isError: false } });
      } catch (err) {
        const message = err instanceof ToolInputError ? err.message : "Banyan could not answer that right now.";
        return reply(msg.id, { result: { content: [{ type: "text", text: message }], isError: true } });
      }
    }
    default:
      return reply(msg.id, { error: { code: -32601, message: `Method not found: ${msg.method}` } });
  }
}

export async function GET() {
  // No server-initiated stream: this server only answers requests (allowed by Streamable HTTP).
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
