export type ProcessRole = 'api' | 'worker' | 'scheduler' | 'all';

const VALID_ROLES: ProcessRole[] = ['api', 'worker', 'scheduler', 'all'];

export function getProcessRole(): ProcessRole {
  const raw = (process.env.PROCESS_ROLE || 'all').toLowerCase().trim();
  if (VALID_ROLES.includes(raw as ProcessRole)) return raw as ProcessRole;
  console.warn(`[processRole] Invalid PROCESS_ROLE="${raw}", defaulting to "all"`);
  return 'all';
}

export function shouldRunWorkers(role?: ProcessRole): boolean {
  const r = role || getProcessRole();
  return r === 'all' || r === 'worker';
}

export function shouldRunCrons(role?: ProcessRole): boolean {
  const r = role || getProcessRole();
  return r === 'all' || r === 'scheduler';
}

export function shouldRunApi(role?: ProcessRole): boolean {
  const r = role || getProcessRole();
  return r === 'all' || r === 'api';
}
