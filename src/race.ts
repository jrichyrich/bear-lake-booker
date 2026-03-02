import { chromium, BrowserContext } from 'playwright';
import { parseArgs } from 'util';
import { execSync } from 'child_process';
import * as fs from 'fs';

const PARK_URL = "https://utahstateparks.reserveamerica.com/camping/bear-lake-state-park/r/campgroundDetails.do?contractCode=UT&parkId=343061";
const SESSION_FILE = "session.json";

// Realistic User Agents
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Edge/120.0.0.0',
];

// Configuration
const { values } = parseArgs({
  options: {
    date: { type: 'string', short: 'd', default: "07/22/2026" },
    length: { type: 'string', short: 'l', default: "6" },
    loop: { type: 'string', short: 'o', default: "BIRCH" },
    concurrency: { type: 'string', short: 'c', default: "10" },
    time: { type: 'string', short: 't' },
    book: { type: 'boolean', short: 'b', default: false },
    headed: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log(`
Bear Lake Booker - RACE MODE (Playwright)

Usage:
  npm run race -- [options]

Options:
  -d, --date <string>        Target arrival date (MM/DD/YYYY) [default: 07/22/2026]
  -l, --length <string>      Length of stay in nights [default: 6]
  -o, --loop <string>        Campground loop name [default: BIRCH]
  -c, --concurrency <number> Number of parallel agents [default: 10]
  -t, --time <string>        Target time (HH:MM:SS)
  -b, --book                 ENABLE AUTO-BOOKING (Attempts to add to cart)
  --headed                   Run with visible browser (for testing)
  -h, --help                 Show help
  `);
  process.exit(0);
}

const TARGET_DATE = values.date!;
const STAY_LENGTH = values.length!;
const LOOP = values.loop!;
const CONCURRENCY = parseInt(values.concurrency!);
const TARGET_TIME = values.time;
const AUTO_BOOK = values.book!;
const IS_HEADED = values.headed!;

let isSuccess = false;

function notifySuccess(siteId: string, agentId: number) {
  if (isSuccess) return;
  isSuccess = true;

  const message = `🚨 SITE CAPTURED! Agent ${agentId} held site ${siteId} for ${TARGET_DATE} in ${LOOP}! CLICK TO PAY NOW.`;
  const recipient = "richards_jason@me.com";

  console.log(`\n[Agent ${agentId}] 🎯 TARGET ACQUIRED!`);

  try {
    const escapedMsg = message.replace(/"/g, '\\"');
    execSync(`osascript -e 'display notification "${escapedMsg}" with title "Bear Lake Booker: CAPTURE" sound name "Glass"'`);
  } catch (e) {}

  try {
    const escapedMsg = message.replace(/"/g, '\\"');
    execSync(`osascript -e 'tell application "Messages" to send "${escapedMsg}" to buddy "${recipient}"'`);
    console.log(`[Agent ${agentId}] 📩 iMessage sent to ${recipient}`);
  } catch (e) {}
}

async function waitForTargetTime(targetTimeStr: string) {
  const [targetHours, targetMinutes, targetSeconds] = targetTimeStr.split(':').map(Number);
  console.log(`⏱️ Waiting for ${targetTimeStr}...`);
  return new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      const now = new Date();
      if (now.getHours() === targetHours && now.getMinutes() === targetMinutes && now.getSeconds() >= targetSeconds!) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}

async function runAgent(agentId: number, context: BrowserContext) {
  const page = await context.newPage();
  try {
    const directUrl = `${PARK_URL}&arrivalDate=${encodeURIComponent(TARGET_DATE)}&lengthOfStay=${STAY_LENGTH}`;
    console.log(`[Agent ${agentId}] 🔧 Priming... Navigating directly to search results...`);
    await page.goto(directUrl, { waitUntil: 'domcontentloaded' });
    
    await page.waitForSelector('#loop');
    await page.selectOption('#loop', { label: LOOP });
    
    console.log(`[Agent ${agentId}] 📝 Filling out dates (Date: ${TARGET_DATE})...`);
    
    // Fill Date: Select All, Backspace, Type, Tab
    await page.click('#arrivaldate');
    await page.keyboard.press('Meta+A');
    await page.keyboard.press('Backspace');
    await page.type('#arrivaldate', TARGET_DATE, { delay: 50 });
    await page.keyboard.press('Tab');

    // Fill Length: Select All, Backspace, Type, Tab
    await page.click('#lengthOfStay');
    await page.keyboard.press('Meta+A');
    await page.keyboard.press('Backspace');
    await page.type('#lengthOfStay', STAY_LENGTH, { delay: 50 });
    await page.keyboard.press('Tab');
    
    console.log(`[Agent ${agentId}] ✅ Primed.`);

    if (TARGET_TIME) {
      await waitForTargetTime(TARGET_TIME);
    }

    const jitterMs = Math.floor(Math.random() * 150);
    await new Promise(res => setTimeout(res, jitterMs));

    console.log(`[Agent ${agentId}] 🚀 FIRING SEARCH (+${jitterMs}ms)`);
    await page.click('button:has-text("Search Available"), #btnsearch');

    if (isSuccess) return;

    // Wait for the results to load
    console.log(`[Agent ${agentId}] ⏳ Waiting for results...`);
    
    // Attempt to find the calendar or the "Date Range" tab
    try {
      await page.waitForSelector('#calendar', { timeout: 10000 });
    } catch (e) {
      console.log(`[Agent ${agentId}] 🔍 Calendar not immediate. Checking for "Date Range Availability" tab...`);
      const dateRangeTab = await page.$('text="Date Range Availability", text="Date Range View"');
      if (dateRangeTab) {
        await dateRangeTab.click();
        await page.waitForSelector('#calendar', { timeout: 10000 });
      } else {
        throw new Error('Could not find calendar or Date Range tab.');
      }
    }

    const availableSite = await page.$('td.status.A a');

    if (availableSite) {
      const siteInfo = await availableSite.getAttribute('title') || 'Unknown Site';
      console.log(`[Agent ${agentId}] 🎯 Found Available Site: ${siteInfo}`);
      
      if (AUTO_BOOK) {
        console.log(`[Agent ${agentId}] 🛒 AUTO-BOOKING... Adding to cart.`);
        await availableSite.click();
        
        await page.waitForSelector('#btnbooknow', { timeout: 5000 }).catch(() => {});
        const bookBtn = await page.$('#btnbooknow');
        if (bookBtn) {
          await bookBtn.click();
          console.log(`[Agent ${agentId}] ✅ Proceeded to cart! Site held for 15 mins.`);
          notifySuccess(siteInfo, agentId);
          if (IS_HEADED) {
            console.log(`[Agent ${agentId}] 📺 Keeping browser open for 30s...`);
            await new Promise(res => setTimeout(res, 30000));
          }
        } else {
          console.log(`[Agent ${agentId}] ⚠️ Found 'A' but failed to find 'Book Now' button.`);
        }
      } else {
        notifySuccess(siteInfo, agentId);
      }
    } else {
      console.log(`[Agent ${agentId}] ❌ No luck.`);
    }

  } catch (error: any) {
    if (!isSuccess) {
      console.error(`[Agent ${agentId}] ⚠️ Error: ${error.message.split('\n')[0]}`);
      await page.screenshot({ path: `agent-${agentId}-error.png` }).catch(() => {});
    }
  } finally {
    await page.close();
  }
}

async function startRace() {
  console.log(`\n🏎️  BEAR LAKE BOOKER RACE MODE (Capture Edition)`);
  
  const hasSession = fs.existsSync(SESSION_FILE);
  if (!hasSession) {
    console.warn('⚠️ WARNING: No session.json found! Running as GUEST (Login recommended).');
  } else {
    console.log('🔑 Authentication session loaded.');
  }

  const browser = await chromium.launch({ headless: !IS_HEADED });
  const agentPromises = [];

  for (let i = 1; i <= CONCURRENCY; i++) {
    const userAgent = USER_AGENTS[i % USER_AGENTS.length]!;
    const context = await browser.newContext({
      userAgent,
      storageState: hasSession ? SESSION_FILE : undefined,
      timezoneId: 'America/Denver',
    });
    
    const staggerStartupMs = i * 200; 
    const promise = new Promise(res => setTimeout(res, staggerStartupMs)).then(() => runAgent(i, context));
    agentPromises.push(promise);
  }

  await Promise.all(agentPromises);
  await browser.close();
}

startRace();
