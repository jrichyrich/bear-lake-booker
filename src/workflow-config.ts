import * as fs from 'fs';
import * as path from 'path';

export const WORKFLOW_CONFIG_FILENAME = 'bear-lake-workflow.json';

export type WorkflowConfig = {
  loop: string;
  siteList: string;
  scoutWindowDays: number;
  scoutConcurrency: number;
  arrivalSweepConcurrency: number;
  bookingConcurrency: number;
  launchTime: string;
  notificationProfile: 'test' | 'production';
  headed: boolean;
  checkoutAuthMode: 'auto' | 'manual';
  accounts: string[];
};

export type LoadedWorkflowConfig = {
  config: WorkflowConfig;
  configPath: string | null;
};

const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  loop: 'BIRCH',
  siteList: 'preferred-sites',
  scoutWindowDays: 14,
  scoutConcurrency: 4,
  arrivalSweepConcurrency: 3,
  bookingConcurrency: 6,
  launchTime: '07:59:59',
  notificationProfile: 'test',
  headed: true,
  checkoutAuthMode: 'manual',
  accounts: [],
};

function normalizePositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? parseInt(value, 10)
      : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizeAccounts(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean),
  ));
}

function normalizeNotificationProfile(value: unknown, fallback: WorkflowConfig['notificationProfile']): WorkflowConfig['notificationProfile'] {
  return value === 'production' ? 'production' : fallback;
}

function normalizeCheckoutAuthMode(value: unknown, fallback: WorkflowConfig['checkoutAuthMode']): WorkflowConfig['checkoutAuthMode'] {
  return value === 'auto' ? 'auto' : value === 'manual' ? 'manual' : fallback;
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function getDefaultWorkflowConfig(): WorkflowConfig {
  return {
    ...DEFAULT_WORKFLOW_CONFIG,
    accounts: [...DEFAULT_WORKFLOW_CONFIG.accounts],
  };
}

export function loadWorkflowConfig(cwd = process.cwd()): LoadedWorkflowConfig {
  const configPath = path.resolve(cwd, WORKFLOW_CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) {
    return {
      config: getDefaultWorkflowConfig(),
      configPath: null,
    };
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  const config: WorkflowConfig = {
    loop: normalizeString(raw.loop, DEFAULT_WORKFLOW_CONFIG.loop),
    siteList: normalizeString(raw.siteList, DEFAULT_WORKFLOW_CONFIG.siteList),
    scoutWindowDays: normalizePositiveInt(raw.scoutWindowDays, DEFAULT_WORKFLOW_CONFIG.scoutWindowDays),
    scoutConcurrency: normalizePositiveInt(raw.scoutConcurrency, DEFAULT_WORKFLOW_CONFIG.scoutConcurrency),
    arrivalSweepConcurrency: normalizePositiveInt(raw.arrivalSweepConcurrency, DEFAULT_WORKFLOW_CONFIG.arrivalSweepConcurrency),
    bookingConcurrency: normalizePositiveInt(
      raw.bookingConcurrency ?? raw.releaseConcurrency,
      DEFAULT_WORKFLOW_CONFIG.bookingConcurrency,
    ),
    launchTime: normalizeString(raw.launchTime, DEFAULT_WORKFLOW_CONFIG.launchTime),
    notificationProfile: normalizeNotificationProfile(raw.notificationProfile, DEFAULT_WORKFLOW_CONFIG.notificationProfile),
    headed: typeof raw.headed === 'boolean' ? raw.headed : DEFAULT_WORKFLOW_CONFIG.headed,
    checkoutAuthMode: normalizeCheckoutAuthMode(raw.checkoutAuthMode, DEFAULT_WORKFLOW_CONFIG.checkoutAuthMode),
    accounts: normalizeAccounts(raw.accounts),
  };

  return {
    config,
    configPath,
  };
}
