#!/usr/bin/env node

import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';

const apiKey = process.env.ENDOLE_API_KEY;
if (!apiKey) {
  console.error('ENDOLE_API_KEY is required. Create a key at https://app.endole.co.uk/api.');
  process.exit(1);
}

serveStdio(() => createServer(apiKey));
