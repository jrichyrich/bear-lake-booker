import { type BrowserContext, type Page } from 'playwright';
import { PARK_URL } from './config';
import { primeSearchForm, sleep, submitSearchForm, waitForSearchResults } from './automation';
import { waitForTargetTime } from './timer-utils';
import { type AgentLaunchTelemetry } from './reporter';

export type LaunchMode = 'preload' | 'refresh' | 'fresh-page';

type ExecuteLaunchStrategyOptions = {
  context: BrowserContext;
  page: Page;
  loop: string;
  targetDate: string;
  stayLength: string;
  targetTime: string | undefined;
  launchMode: LaunchMode;
  agentLabel?: string;
};

type LaunchStrategyResult = {
  page: Page;
  telemetry: AgentLaunchTelemetry;
};

export function parseLaunchMode(value?: string): LaunchMode {
  if (value === 'refresh' || value === 'fresh-page') {
    return value;
  }
  return 'preload';
}

async function submitAndWait(page: Page): Promise<void> {
  await sleep(Math.random() * 200);
  await submitSearchForm(page);
  await waitForSearchResults(page);
}

function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

export async function executeLaunchStrategy({
  context,
  page,
  loop,
  targetDate,
  stayLength,
  targetTime,
  launchMode,
  agentLabel = '',
}: ExecuteLaunchStrategyOptions): Promise<LaunchStrategyResult> {
  console.log(`${agentLabel}Launch mode: ${launchMode}`);
  const startedAtMs = Date.now();
  let warmupStartedAtMs = startedAtMs;
  let warmupCompletedAtMs: number | undefined;
  let waitStartedAtMs: number | undefined;
  let targetTimeReachedAtMs: number | undefined;
  let refreshStartedAtMs: number | undefined;
  let freshPageOpenedAtMs: number | undefined;
  let submitStartedAtMs: number | undefined;
  let resultsVisibleAtMs: number | undefined;

  const finalize = (finalPage: Page): LaunchStrategyResult => {
    const submitAt = submitStartedAtMs ?? Date.now();
    const resultsAt = resultsVisibleAtMs ?? Date.now();
    return {
      page: finalPage,
      telemetry: {
        mode: launchMode,
        startedAt: toIso(startedAtMs),
        warmupStartedAt: toIso(warmupStartedAtMs),
        warmupCompletedAt: warmupCompletedAtMs ? toIso(warmupCompletedAtMs) : undefined,
        waitStartedAt: waitStartedAtMs ? toIso(waitStartedAtMs) : undefined,
        targetTimeReachedAt: targetTimeReachedAtMs ? toIso(targetTimeReachedAtMs) : undefined,
        refreshStartedAt: refreshStartedAtMs ? toIso(refreshStartedAtMs) : undefined,
        freshPageOpenedAt: freshPageOpenedAtMs ? toIso(freshPageOpenedAtMs) : undefined,
        submitStartedAt: toIso(submitAt),
        resultsVisibleAt: toIso(resultsAt),
        durationsMs: {
          warmup: warmupCompletedAtMs ? warmupCompletedAtMs - warmupStartedAtMs : undefined,
          waitForTarget: waitStartedAtMs && targetTimeReachedAtMs ? targetTimeReachedAtMs - waitStartedAtMs : undefined,
          submitToResults: resultsAt - submitAt,
          totalLaunch: resultsAt - startedAtMs,
        },
      },
    };
  };

  if (!targetTime) {
    await primeSearchForm(page, loop, targetDate, stayLength, agentLabel);
    warmupCompletedAtMs = Date.now();
    submitStartedAtMs = Date.now();
    await submitAndWait(page);
    resultsVisibleAtMs = Date.now();
    return finalize(page);
  }

  if (launchMode === 'preload') {
    await primeSearchForm(page, loop, targetDate, stayLength, agentLabel);
    warmupCompletedAtMs = Date.now();
    waitStartedAtMs = Date.now();
    await waitForTargetTime(targetTime);
    targetTimeReachedAtMs = Date.now();
    submitStartedAtMs = Date.now();
    await submitAndWait(page);
    resultsVisibleAtMs = Date.now();
    return finalize(page);
  }

  if (launchMode === 'refresh') {
    await primeSearchForm(page, loop, targetDate, stayLength, agentLabel);
    warmupCompletedAtMs = Date.now();
    waitStartedAtMs = Date.now();
    await waitForTargetTime(targetTime);
    targetTimeReachedAtMs = Date.now();
    console.log(`${agentLabel}Refreshing the search page at launch time...`);
    refreshStartedAtMs = Date.now();
    await primeSearchForm(page, loop, targetDate, stayLength, agentLabel);
    submitStartedAtMs = Date.now();
    await submitAndWait(page);
    resultsVisibleAtMs = Date.now();
    return finalize(page);
  }

  await page.goto(PARK_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  console.log(`${agentLabel}Warmed a page and will open a fresh tab at launch time...`);
  warmupCompletedAtMs = Date.now();
  waitStartedAtMs = Date.now();
  await waitForTargetTime(targetTime);
  targetTimeReachedAtMs = Date.now();

  freshPageOpenedAtMs = Date.now();
  const freshPage = await context.newPage();
  await primeSearchForm(freshPage, loop, targetDate, stayLength, agentLabel);
  submitStartedAtMs = Date.now();
  await submitAndWait(freshPage);
  resultsVisibleAtMs = Date.now();
  await page.close().catch(() => {});
  return finalize(freshPage);
}
