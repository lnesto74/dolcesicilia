# Claude Desktop ↔ Dolce Sicilia (MCP)

Connect **Claude Desktop** (your project + skills) to **live Dolce data** on your Mac — same database as the website, plus shared business memory.

**Full architecture (data exchange, drafting, normalization, UI):** see **[claude-mcp-messaging-flow.md](./claude-mcp-messaging-flow.md)**.

> **Primary path:** compose in Desktop/Cowork with project skills → `queue_personalized_messages`. The Messages page loads `message_queue` and displays bodies as-is (manual send only). **Fallbacks:** `draft_personalized_campaigns` and the website **Server draft** button use `lucaVoice.ts` — not Desktop skills.

> **Same database:** The website API and the MCP connector **must** use the same `DOLCE_DB_PATH` (absolute path to `server/data/contacts.db`). If they point at different clones or copies, `queue_personalized_messages` will succeed but Messages will show an empty queue.

## What you get

| MCP tool | What it does |
|----------|----------------|
| `get_full_snapshot` | Best starting point — orders, segments, trends, memory |
| `get_order_analytics` | Orders, revenue, heatmap insights |
| `get_customer_segments` | Win-back, tray upsell, VIP, high-value, top spenders |
| `get_campaign_feedback` | Follow-up survey scores |
| `get_business_memory` | Shared learnings file |
| `save_business_insight` | Append a learning (Desktop → website AI sees it too) |
| `get_recent_strategies` | Last run from Orders page “Run analysis” |
| `save_message_template` | Add a WhatsApp template to `/customers/messages` |
| **`draft_personalized_campaigns`** | Auto-draft 1-to-1 segment messages via server `generateCampaignDrafts()` + `lucaVoice.ts` — **not** Desktop skills |
| `queue_custom_message` | Queue one shared body you wrote in chat (skill-powered) |
| `queue_personalized_messages` | Queue per-contact bodies you wrote in chat (**skill-powered**) |

**Resources:** `dolcesicilia://business-memory`, `dolcesicilia://snapshot`

## One-time setup (Mac)

### 1. Install MCP into Claude Desktop

```bash
cd /Users/lnesto/CascadeProjects/dolcesicilia
chmod +x scripts/install-claude-mcp.sh
./scripts/install-claude-mcp.sh
```

This merges into:

`~/Library/Application Support/Claude/claude_desktop_config.json`

Uses Node **v18** (same as your Dolce server) so `better-sqlite3` works.

### 2. Restart Claude Desktop

- **Quit fully** (Cmd+Q), not just close window  
- Reopen Claude Desktop  
- **Settings → Developer → MCP** — `dolcesicilia` should show **connected**

### 3. Use with your existing project

Open your **Dolce Sicilia Claude project** (skills, menu docs, tone). Skills shape copy when **you write messages in chat** (route c); they do **not** affect `draft_personalized_campaigns`.

Example prompts:

- *“Call get_full_snapshot. Who should get the tray upsell WhatsApp this week?”*
- *“Auto-draft high-value-first (server voice, not my skills): draft_personalized_campaigns segmentId high-value-first”*
- *“Write unique Chef Luca messages for each eligible high-value contact, then queue_personalized_messages”* → **skill-powered**
- *“Save this insight: Friday 6–8pm is our peak Grab window.”* → uses `save_business_insight`
- *“Save a win-back template, then queue_custom_message for the win-back segment.”* → skill-powered body + queue

## Shared memory (learns over time)

File: `server/data/business-memory.md`

- **Claude Desktop** appends via `save_business_insight`
- **Orders page AI** reads it on every “Run analysis” and appends key patterns after each run

Both channels stay aligned without Anthropic syncing Desktop ↔ API.

## Manual config (if install script fails)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dolcesicilia": {
      "command": "/Users/lnesto/.nvm/versions/node/v18.20.5/bin/node",
      "args": [
        "/Users/lnesto/CascadeProjects/dolcesicilia/server/mcp/index.js"
      ],
      "env": {
        "DOLCE_DB_PATH": "/Users/lnesto/CascadeProjects/dolcesicilia/server/data/contacts.db"
      }
    }
  }
}
```

Both `args` and `env.DOLCE_DB_PATH` must point at **this** repo — not an older clone. On MCP connect, stderr should log the same path as the API (`[db] using …` in `/tmp/dolcesicilia-app.log`).

## Test MCP from terminal

```bash
cd server
npm run mcp
```

Should print: `Dolce Sicilia MCP server running (stdio)`  
(Ctrl+C to stop — Claude Desktop launches this automatically.)

## Architecture

```
Claude Desktop / Cowork (project skills)
        ↓ MCP stdio — PRIMARY: queue_personalized_messages (route c)
server/mcp/index.js
        ↓
message_queue  +  server/data/contacts.db  +  business-memory.md
        ↑
Messages page: load queue → display → manual OpenWA send
        ↑
FALLBACKS (a)+(b): generateCampaignDrafts() → Anthropic API + lucaVoice.ts
  (a) Website Other options → Server draft → POST /api/ai/draft-messages
  (b) draft_personalized_campaigns
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| MCP shows disconnected | Quit Claude fully; check Node path in config |
| `better-sqlite3` error | MCP must use **Node 18** (not Node 22) |
| Empty segments | Import customers on website first |
| Desktop doesn’t use memory | Ask it to call `get_business_memory` or `get_full_snapshot` |

## Security

- MCP only runs **locally** on your Mac  
- Reads your SQLite DB — no data sent except what you send to Claude in chat  
- `business-memory.md` is local; add to your Desktop project files if you want static context too
