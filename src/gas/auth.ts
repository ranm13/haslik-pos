import type { ApiRequest, Role } from '../shared/api';
import { hashSecret, isLocked, LOCK_MINUTES, roleForPin, type PinHashes } from '../core/auth';
import { AppError } from '../core/errors';
import { cleanText } from '../core/text';
import { getProp, isConfigured, PROP } from './config';
import { cache, sha } from './util';

export interface Ctx {
  role: Role;
  who: string;
  clientTxId: string;
}

const FAILS_KEY = 'pinFails'; // global, as in the legacy app (D23)

function pinHashes(): PinHashes {
  return { salt: getProp(PROP.PIN_SALT), bar: getProp(PROP.BAR_PIN_HASH), admin: getProp(PROP.ADMIN_PIN_HASH) };
}

/** Google account of the visitor. With "execute as me" Google only reveals it for the script owner. */
function visitorEmail(): string {
  try { return Session.getActiveUser().getEmail() || ''; } catch { return ''; }
}

function isOwner(email: string): boolean {
  if (!email) return false;
  const admin = (getProp(PROP.ADMIN_EMAIL) || Session.getEffectiveUser().getEmail() || '').toLowerCase();
  return !!admin && email.toLowerCase() === admin;
}

/** Owner account = admin without a PIN; otherwise bar/admin PIN. Throws AppError with the code the page reacts to. */
export function authenticate(req: ApiRequest): Ctx {
  if (!isConfigured()) throw new AppError('NOT_CONFIGURED', 'המערכת עוד לא הוגדרה. יש להריץ setup');
  const clientTxId = cleanText(req.clientTxId, 80);
  const email = visitorEmail();
  if (isOwner(email)) return { role: 'admin', who: email, clientTxId };

  const c = cache();
  const fails = Number(c.get(FAILS_KEY) || 0);
  if (isLocked(fails)) throw new AppError('RATE_LIMITED', 'יותר מדי ניסיונות שגויים. נסה שוב בעוד ' + LOCK_MINUTES + ' דקות');
  const pin = String(req.auth?.pin || '');
  const role = roleForPin(sha, pinHashes(), pin);
  if (!role) {
    if (pin) c.put(FAILS_KEY, String(fails + 1), LOCK_MINUTES * 60);
    throw new AppError('PIN_REQUIRED', pin ? 'קוד שגוי' : 'נדרש קוד כניסה');
  }
  return { role, who: email || (role === 'admin' ? 'מנהל' : 'בר'), clientTxId };
}

export function hashPin(pin: string): string {
  return hashSecret(sha, getProp(PROP.PIN_SALT), pin);
}
