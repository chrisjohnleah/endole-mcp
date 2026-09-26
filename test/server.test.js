import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { requestEndole } from '../src/server.js';

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
