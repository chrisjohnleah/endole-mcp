import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const BASE_URL = 'https://api.endole.co.uk';
const companyNumber = z.string().regex(/^[A-Z0-9]{8}$/i, 'Use an 8-character UK company number, including leading zeroes.');
const pageNumber = z.number().int().min(1).optional();

const DATASETS = [
  ['profile', 'Company profile', 1, 'Core company details, SIC codes and registered address'],
  ['appointments', 'Company appointments', 1, 'Current and former company officers', true],
  ['financials', 'Company financials', 10, 'Up to three years of accounts and financial statements'],
  ['group-structure', 'Company group structure', 20, 'Parent companies and subsidiaries'],
  ['ccj', 'Company county court judgments', 20, 'Up to six years of CCJ records', true],
  ['shareholders', 'Company shareholders', 20, 'Shareholdings, share classes and ownership percentages', true],
  ['credit-score-limit', 'Company credit score and limit', 30, 'Historical credit scores and recommended limits'],
  ['vat-number', 'Company VAT number', 5, 'VAT registration details and possible matches'],
  ['documents', 'Company documents', 1, 'Filing history and document links', true]
];

export async function requestEndole(path, apiKey, fetcher = fetch) {
  try {
    const response = await fetcher(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.status === 'error') {
      const detail = [body?.code, body?.message].filter(Boolean).join(': ');
      throw new Error(`Endole HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error(`Endole HTTP ${response.status}: expected a JSON object`);
    }
    return { content: [{ type: 'text', text: JSON.stringify(body) }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error.message }] };
  }
}

export function createServer(apiKey, fetcher = fetch) {
  const server = new McpServer({ name: 'endole-mcp', version: '1.0.0' });

  server.registerTool('search_companies', {
    title: 'Search Endole companies',
    description: 'Search UK companies by name, company number or keyword. A successful result costs 1 Endole credit.',
    inputSchema: z.object({ query: z.string().trim().min(1).max(200), page: pageNumber })
  }, ({ query, page }) => requestEndole(`/company/search?${new URLSearchParams({ query, ...(page ? { page: String(page) } : {}) })}`, apiKey, fetcher));

  for (const [path, title, credits, description, paginated] of DATASETS) {
    server.registerTool(`get_company_${path.replaceAll('-', '_')}`, {
      title,
      description: `${description}. A successful result costs ${credits} Endole credit${credits === 1 ? '' : 's'}.`,
      inputSchema: z.object({ company_number: companyNumber, ...(paginated ? { page: pageNumber } : {}) })
    }, ({ company_number, page }) => requestEndole(`/company/${company_number.toUpperCase()}/${path}${page ? `?page=${page}` : ''}`, apiKey, fetcher));
  }

  return server;
}
