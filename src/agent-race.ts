import { spawn, execSync } from 'child_process';
import { parseArgs } from 'util';
import * as fs from 'fs';

const PARK_URL = "https://utahstateparks.reserveamerica.com/camping/bear-lake-state-park/r/campgroundDetails.do?contractCode=UT&parkId=343061";
const LOGIN_URL = "https://utahstateparks.reserveamerica.com/memberSignIn.do";
const SESSION_NAME = "bear-lake-master";

// Configuration
const { values } = parseArgs({
  options: {
    date: { type: 'string', short: 'd', default: "07/22/2026" },
    length: { type: 'string', short: 'l', default: "6" },
    loop: { type: 'string', short: 'o', default: "BIRCH" },
    concurrency: { type: 'string', short: 'c', default: "5" },
    time: { type: 'string', short: 't' },
    book: { type: 'boolean', short: 'b', default: false },
    headed: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log(`
Bear Lake Booker - AI RACE MODE (E2E)

Usage:
  npx tsx src/agent-race.ts [options]

Options:
  -d, --date <string>        Target date [default: 07/22/2026]
  -l, --length <string>      Length of stay [default: 6]
  -o, --loop <string>        Loop [default: BIRCH]
  -c, --concurrency <number> Number of agents [default: 5]
  -t, --time <string>        Drop time (HH:MM:SS)
  -b, --book                 ENABLE AUTO-BOOKING
  --headed                   Visible browser
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

let isFinished = false;

function notify(message: string) {
  const recipient = "richards_jason@me.com";
  console.log(`\n🔔 NOTIFICATION: ${message}`);
  try {
    const escapedMsg = message.replace(/"/g, '\\"');
    execSync(`osascript -e 'display notification "${escapedMsg}" with title "Bear Lake Booker: CAPTURE" sound name "Glass"'`);
    execSync(`osascript -e 'tell application "Messages" to send "${escapedMsg}" to buddy "${recipient}"'`);
  } catch (e) {}
}

async function performManualLogin() {
  console.log("\n🔓 Opening browser for MANUAL LOGIN...");
  console.log("1. Log in to ReserveAmerica/Utah State Parks.");
  console.log("2. Once logged in, come back here and press ENTER to start the race.");

  try {
    execSync(`agent-browser --headed --session-name ${SESSION_NAME} open "${LOGIN_URL}"`);
    await new Promise(resolve => process.stdin.once('data', resolve));
    console.log("✅ Session captured. Priming agents...");
  } catch (e: any) {
    console.error("❌ Login failed.");
    process.exit(1);
  }
}

function runCmd(cmd: string): string {
  const headedFlag = IS_HEADED ? '--headed' : '';
  try {
    return execSync(`agent-browser ${headedFlag} --session-name ${SESSION_NAME} ${cmd}`, { stdio: 'pipe' }).toString().trim();
  } catch (e: any) {
    throw new Error(e.stderr?.toString() || e.message);
  }
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

async function startAgent(id: number) {
  console.log(`[Agent ${id}] 🤖 Mission started.`);
  try {
    runCmd(`open "${PARK_URL}"`);
    runCmd(`wait 3000`);
    runCmd(`select "#loop" "${LOOP}"`);
    runCmd(`fill "#campingDate" "${TARGET_DATE}"`);
    runCmd(`fill "#lengthOfStay" "${STAY_LENGTH}"`);
    console.log(`[Agent ${id}] ✅ Primed.`);

    if (TARGET_TIME) await waitForTargetTime(TARGET_TIME);

    const jitterMs = Math.floor(Math.random() * 200);
    await new Promise(res => setTimeout(res, jitterMs));
    
    console.log(`[Agent ${id}] 🚀 FIRING SEARCH (+${jitterMs}ms)`);
    runCmd(`click "role=button[name='Search Available']"`);
    
    if (isFinished) return;

    const calendarText = runCmd(`get text "#calendar"`);
    if (calendarText.includes('A')) {
      console.log(`[Agent ${id}] 🎯 TARGET ACQUIRED!`);
      if (AUTO_BOOK) {
        console.log(`[Agent ${id}] 🛒 Attempting to Capture...`);
        
        // Try clicking the first available "See Details" button or "A" link
        try {
          runCmd(`click "role=button[name='See Details']"`);
        } catch (e) {
          runCmd(`click "td.status.A a"`);
        }
        
        runCmd(`wait 2000`);
        
        // Click the final "Book Now" button
        console.log(`[Agent ${id}] ⚡ Clicking Book Now...`);
        runCmd(`click "#btnbooknow, role=button[name='Book Now']"`);
        
        notify(`Agent ${id} CAPTURED spot for ${TARGET_DATE}!`);
        if (IS_HEADED) {
          console.log(`[Agent ${id}] 📺 Staying open for 10m...`);
          runCmd(`wait 600000`);
        }
      } else {
        notify(`Agent ${id} found availability!`);
      }
      isFinished = true;
    } else {
      console.log(`[Agent ${id}] ❌ No luck.`);
    }
  } catch (error: any) {
    if (!isFinished) console.error(`[Agent ${id}] ⚠️ Error: ${error.message.split('\n')[0]}`);
  }
}

async function runRace() {
  console.log(`\n🏎️  BEAR LAKE BOOKER E2E RACE`);
  await performManualLogin();

  const agentPromises = [];
  for (let i = 1; i <= CONCURRENCY; i++) {
    agentPromises.push(startAgent(i));
    await new Promise(res => setTimeout(res, 1000));
  }
  await Promise.all(agentPromises);
}

runRace();
