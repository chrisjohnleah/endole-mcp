# Endole MCP

An **unofficial**, local [Model Context Protocol](https://modelcontextprotocol.io/) server for the [Endole API](https://api-docs.endole.co.uk/introduction). It gives Claude Desktop, Claude Code, and other MCP clients tools to search UK companies and retrieve Endole company data. The server runs on your computer over stdio; API requests go directly to Endole.

## Requirements

- Node.js 20 or newer
- An Endole subscription and an API key from the [Endole API dashboard](https://app.endole.co.uk/api)

Use a sandbox key to try the tools with mock data and no credit charge. Live keys use your Endole credits. Endole documents a standard limit of 100 requests per 10 minutes per account. Each successful response includes Endole's `meta.credits` information. See [authentication](https://api-docs.endole.co.uk/authentication), [credits](https://api-docs.endole.co.uk/credits), [rate limits](https://api-docs.endole.co.uk/rate-limits), and [sandbox](https://api-docs.endole.co.uk/sandbox).

## Install

```sh
git clone https://github.com/chrisjohnleah/endole-mcp.git
cd endole-mcp
npm ci
```

Find the absolute paths to Node and this checkout with `command -v node` and `pwd`. MCP clients often launch with a different `PATH` than your terminal, so use the absolute Node path in their configuration.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows. Add this entry inside `mcpServers`, replacing both paths and the key:

```json
{
  "mcpServers": {
    "endole": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/endole-mcp/src/index.js"],
      "env": { "ENDOLE_API_KEY": "your_endole_api_key" }
    }
  }
}
```

Restart Claude Desktop after saving. Keep the configuration file private; never commit a real API key. If your MCP client offers a secret store, use it instead of plain-text configuration.

### Claude Code

```sh
claude mcp add --scope user --transport stdio endole \
  --env ENDOLE_API_KEY=your_endole_api_key \
  -- /absolute/path/to/node /absolute/path/to/endole-mcp/src/index.js
claude mcp get endole
```

The `--env` value is saved in Claude Code's local MCP configuration. Protect that file and avoid entering a live key into shared shell history. For other MCP clients, configure a **stdio** server with the same command, arguments, and `ENDOLE_API_KEY` environment variable.

## Tools

Each tool makes one Endole API request and returns the API's JSON response, including its credit metadata. Costs below are from [Endole's endpoint documentation](https://api-docs.endole.co.uk/introduction); Endole says requests returning no data consume no credits.

| Tool | Data | Credits for a successful result |
| --- | --- | ---: |
| `search_companies` | Name, number, or keyword search | 1 |
| `get_company_profile` | Company profile | 1 |
| `get_company_appointments` | Officers and appointments | 1 |
| `get_company_financials` | Accounts and financials | 10 |
| `get_company_group_structure` | Parent and subsidiary companies | 20 |
| `get_company_ccj` | County Court Judgments | 20 |
| `get_company_shareholders` | Shareholder records | 20 |
| `get_company_credit_score_limit` | Credit score and limit | 30 |
| `get_company_vat_number` | VAT registration | 5 |
| `get_company_documents` | Filing history and document links | 1 |

Search accepts a `query`. Other tools accept an eight-character `company_number`, including leading zeroes. The server does not download linked documents. Endole's API terms and subscription govern use of the data; the MIT licence covers this server's code only.

## Check locally

```sh
npm test
```

The tests use a dummy key and mock API responses; they do not consume Endole credits. To test against Endole, create a sandbox key, configure it in an MCP client, and search for a company.

## Licence

MIT. This project is independent of Endole and is not endorsed by Endole.
