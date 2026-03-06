import { chromium, type BrowserContext, type Page, type Request } from 'playwright';
import { parseArgs } from 'util';
import { mkdirSync, createWriteStream, existsSync } from 'fs';
import { join, resolve } from 'path';
import { PARK_URL, SESSION_FILE } from './config';

const CAPTURE_DIR = 'captures';

const { values } = parseArgs({
  options: {
    url: { type: 'string', short: 'u', default: PARK_URL },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log(`
Bear Lake Booker - Network Inspector

Usage:
  npm run inspect -- [options]

Options:
  -u, --url <string>   URL to open [default: Bear Lake campground page]
  -h, --help           Show help
  `);
  process.exit(0);
}

function shouldCapture(url: string): boolean {
  return (
    url.includes('reserveamerica.com') ||
    url.includes('utahstateparks.reserveamerica.com')
  );
}

function serializeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, value]),
  );
}

async function attachLogging(context: BrowserContext, capturePath: string) {
  const stream = createWriteStream(capturePath, { flags: 'a' });

  const write = (event: Record<string, unknown>) => {
    stream.write(`${JSON.stringify(event)}\n`);
  };

  const logRequest = async (request: Request) => {
    const url = request.url();
    if (!shouldCapture(url)) {
      return;
    }

    const response = await request.response().catch(() => null);

    write({
      ts: new Date().toISOString(),
      method: request.method(),
      resourceType: request.resourceType(),
      url,
      postData: request.postData() ?? null,
      headers: serializeHeaders(request.headers()),
      status: response?.status() ?? null,
      responseHeaders: response ? serializeHeaders(await response.allHeaders()) : null,
      redirectedFrom: request.redirectedFrom()?.url() ?? null,
      frameUrl: request.frame()?.url() ?? null,
    });
  };

  context.on('requestfinished', (request) => {
    void logRequest(request);
  });

  context.on('requestfailed', (request) => {
    const url = request.url();
    if (!shouldCapture(url)) {
      return;
    }

    write({
      ts: new Date().toISOString(),
      method: request.method(),
      resourceType: request.resourceType(),
      url,
      postData: request.postData() ?? null,
      headers: serializeHeaders(request.headers()),
      failure: request.failure()?.errorText ?? 'unknown',
      redirectedFrom: request.redirectedFrom()?.url() ?? null,
      frameUrl: request.frame()?.url() ?? null,
    });
  });

  return stream;
}

async function main() {
  const sessionPath = resolve(process.cwd(), SESSION_FILE);
  if (!existsSync(sessionPath)) {
    throw new Error(`Missing ${sessionPath}. Run \`npm run auth\` first.`);
  }

  const captureDir = resolve(process.cwd(), CAPTURE_DIR);
  mkdirSync(captureDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const capturePath = join(captureDir, `network-${stamp}.jsonl`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: sessionPath,
    timezoneId: 'America/Denver',
  });
  const stream = await attachLogging(context, capturePath);
  const page = await context.newPage();

  console.log(`Writing ReserveAmerica network events to ${capturePath}`);
  console.log('Click through the flow manually in the opened browser.');
  console.log('Focus on one `Enter Date` path and one `See Details` path if available.');
  console.log('When finished, press Enter here to close the browser and save the log.');

  await page.goto(values.url!, { waitUntil: 'domcontentloaded' });

  process.stdin.resume();
  await new Promise<void>((resolvePromise) => {
    process.stdin.once('data', () => resolvePromise());
    browser.on('disconnected', () => resolvePromise());
  });

  stream.end();
  await browser.close().catch(() => { });
  console.log(`Capture complete: ${capturePath}`);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
