import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DB, AuditEntry, Message } from './types.js';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
export const EVIDENCE_DIR = path.join(DATA_DIR, 'evidence');
const DB_FILE = path.join(DATA_DIR, 'veripay.json');

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

function empty(): DB {
  return {
    users: [], experts: [], sessions: [], tokens: [], projects: [], submissions: [], qaRuns: [], feedback: [],
    expertReviews: [], allocations: [], settlements: [], transactions: [], messages: [], scopeChanges: [],
    audit: [], meta: { seededAt: null, version: 1 },
  };
}

let state: DB = load();

function load(): DB {
  try {
    if (fs.existsSync(DB_FILE)) return { ...empty(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } catch (e) {
    console.error('[db] failed to read store, starting empty', e);
  }
  return empty();
}

let writeTimer: NodeJS.Timeout | null = null;
/** Persist (debounced, atomic rename). */
export function save() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
    fs.renameSync(tmp, DB_FILE);
  }, 50);
}

export function flushNow() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 1));
}

export const db = () => state;
export function resetDB() { state = empty(); flushNow(); }

export const id = (prefix: string) => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
export const now = () => new Date().toISOString();

export function audit(e: Omit<AuditEntry, 'id' | 'at'> & { at?: string }) {
  const entry: AuditEntry = { id: id('aud'), at: e.at || now(), ...e } as AuditEntry;
  state.audit.push(entry);
  save();
  return entry;
}

export function postMessage(m: Omit<Message, 'id' | 'createdAt'> & { createdAt?: string }) {
  const msg: Message = { id: id('msg'), createdAt: m.createdAt || now(), ...m } as Message;
  state.messages.push(msg);
  save();
  return msg;
}

export function saveEvidenceFile(buf: Buffer, ext: string): string {
  const name = `${id('ev')}.${ext.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin'}`;
  fs.writeFileSync(path.join(EVIDENCE_DIR, name), buf);
  return `/evidence/${name}`;
}

export function readEvidenceFile(p: string): Buffer | null {
  const name = path.basename(p);
  const full = path.join(EVIDENCE_DIR, name);
  return fs.existsSync(full) ? fs.readFileSync(full) : null;
}
