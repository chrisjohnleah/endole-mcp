import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createServer, requestEndole } from '../src/server.js';

test('passes the key only in the header and returns Endole data with credit metadata', async () => {
  let request;
  const body = { status: 'success', data: { search: { items: [] } }, meta: { credits: { cost: 1, remaining: 9 } } };
  const result = await requestEndole('/company/search?query=Acme+Ltd', 'test-key', async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => body };
  });

  assert.equal(request.url, 'https://api.endole.co.uk/company/search?query=Acme+Ltd');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(JSON.parse(result.content[0].text).meta.credits.remaining, 9);
  assert.equal(result.isError, undefined);
});

test('reports Endole rate limits as a tool error', async () => {
  const result = await requestEndole('/company/12345678/profile', 'test-key', async () => ({
    ok: false,
    status: 429,
    json: async () => ({ status: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'Please wait.' })
  }));

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /HTTP 429: RATE_LIMIT_EXCEEDED: Please wait/);
  assert.doesNotMatch(result.content[0].text, /test-key/);
});

test('starts over stdio, advertises all ten tools and rejects invalid company numbers', () => {
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_company_profile', arguments: { company_number: '../oops' } } }
  ];
  const run = spawnSync(process.execPath, ['src/index.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, ENDOLE_API_KEY: 'test-key' },
    input: `${messages.map(message => JSON.stringify(message)).join('\n')}\n`,
    encoding: 'utf8',
    timeout: 5000
  });
  assert.equal(run.status, 0, run.stderr);
  const replies = run.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(replies.find(reply => reply.id === 1).result.serverInfo.name, 'endole-mcp');
  assert.equal(replies.find(reply => reply.id === 2).result.tools.length, 10);
  assert.equal(replies.find(reply => reply.id === 3).result.isError, true);
});

test('routes every documented tool, passes pages and rejects page zero', { timeout: 5000 }, async () => {
  const urls = [];
  const server = createServer('test-key', async url => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => ({ status: 'success', data: {} }) };
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await clientTransport.start();
  let id = 0;
  const call = async (method, params = {}) => {
    const currentId = ++id;
    const reply = new Promise(resolve => {
      clientTransport.onmessage = message => {
        if (message.id === currentId) resolve(message);
      };
    });
    await clientTransport.send({ jsonrpc: '2.0', id: currentId, method, params });
    return reply;
  };

  try {
    await call('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    await clientTransport.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const cases = [
      ['search_companies', { query: 'Acme Ltd', page: 2 }, '/company/search?query=Acme+Ltd&page=2'],
      ['get_company_profile', { company_number: 'sc000001' }, '/company/SC000001/profile'],
      ['get_company_appointments', { company_number: 'sc000001', page: 2 }, '/company/SC000001/appointments?page=2'],
      ['get_company_financials', { company_number: 'sc000001' }, '/company/SC000001/financials'],
      ['get_company_group_structure', { company_number: 'sc000001' }, '/company/SC000001/group-structure'],
      ['get_company_ccj', { company_number: 'sc000001', page: 2 }, '/company/SC000001/ccj?page=2'],
      ['get_company_shareholders', { company_number: 'sc000001', page: 2 }, '/company/SC000001/shareholders?page=2'],
      ['get_company_credit_score_limit', { company_number: 'sc000001' }, '/company/SC000001/credit-score-limit'],
      ['get_company_vat_number', { company_number: 'sc000001' }, '/company/SC000001/vat-number'],
      ['get_company_documents', { company_number: 'sc000001', page: 2 }, '/company/SC000001/documents?page=2']
    ];
    for (const [name, args] of cases) {
      const reply = await call('tools/call', { name, arguments: args });
      assert.equal(reply.result.isError, undefined, name);
    }
    assert.deepEqual(urls, cases.map(([, , path]) => `https://api.endole.co.uk${path}`));
    const invalid = await call('tools/call', { name: 'search_companies', arguments: { query: 'Acme', page: 0 } });
    assert.equal(invalid.result.isError, true);
    assert.equal(urls.length, cases.length);
  } finally {
    await clientTransport.close();
    await server.close();
  }
});
