declare const __VERSION__: string;

export const VERSION: string = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';

/* Non-secret constants (were Config.gs). Secrets and ids live in Script Properties. */
export const PUB_NAME = 'פאב "הסליק"';
export const CLOSE_HOUR = 8;              // month closes on the last day at 08:00
export const SHIFT_OFFSET_HOURS = 8;      // a sale before 08:00 belongs to the previous evening
export const BACKUP_KEEP_DAYS = 120;
export const LOCK_WAIT_MS = 25000;
export const IDEMPOTENCY_TTL_S = 6 * 3600;

export const PROP = {
  MASTER_ID: 'MASTER_ID',
  REPORTS_FOLDER_ID: 'REPORTS_FOLDER_ID',
  BACKUP_FOLDER_ID: 'BACKUP_FOLDER_ID',
  PIN_SALT: 'PIN_SALT',
  BAR_PIN_HASH: 'BAR_PIN_HASH',
  ADMIN_PIN_HASH: 'ADMIN_PIN_HASH',
  ADMIN_EMAIL: 'ADMIN_EMAIL',
  FINANCE_EMAILS: 'FINANCE_EMAILS',
  MEMBERS_FILE_ID: 'MEMBERS_FILE_ID',
  MEMBERS_TAB_NAME: 'MEMBERS_TAB_NAME',
  MEMBERS_LAST_HEADER: 'MEMBERS_LAST_HEADER',
  MEMBERS_FIRST_HEADER: 'MEMBERS_FIRST_HEADER',
  /* One-time inputs typed by the user in Project Settings; setup() consumes and deletes them. */
  INITIAL_BAR_PIN: 'INITIAL_BAR_PIN',
  INITIAL_ADMIN_PIN: 'INITIAL_ADMIN_PIN',
  MEMBERS_URL: 'MEMBERS_URL',
} as const;

const props = () => PropertiesService.getScriptProperties();

export function getProp(key: string): string {
  return props().getProperty(key) || '';
}

export function setProps(values: Record<string, string>): void {
  props().setProperties(values, false);
}

export function deleteProp(key: string): void {
  props().deleteProperty(key);
}

export function isConfigured(): boolean {
  return !!getProp(PROP.ADMIN_PIN_HASH) && !!getProp(PROP.BAR_PIN_HASH) && !!getProp(PROP.MASTER_ID);
}

