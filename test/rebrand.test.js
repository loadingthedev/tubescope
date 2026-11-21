import { test } from 'bun:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Database } from 'bun:sqlite';
import { env } from '../src/lib/env.js';

const ROOT = path.resolve(import.meta.dir, '..');

test('environment fallback prefers the new name, including an explicit empty value', () => {
  const names = ['TUBESCOPE_DATA_DIR', 'TUBEDESK_DATA_DIR'];
  const saved = names.map(name => process.env[name]);
  try {
    delete process.env.TUBESCOPE_DATA_DIR;
    process.env.TUBEDESK_DATA_DIR = '/legacy';
    assert.equal(env('DATA_DIR'), '/legacy');
    process.env.TUBESCOPE_DATA_DIR = '/current';
    assert.equal(env('DATA_DIR'), '/current');
    process.env.TUBESCOPE_DATA_DIR = '';
    assert.equal(env('DATA_DIR'), '');
    for (const name of names) delete process.env[name];
    assert.equal(env('DATA_DIR'), undefined);
  } finally {
    names.forEach((name, i) => saved[i] === undefined ? delete process.env[name] : process.env[name] = saved[i]);
  }
});

test('default database rename preserves settings and WAL data, accepts old backups, and keeps an existing new database', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tubescope-migration-'));
  const oldFile = path.join(dir, 'tubedesk.sqlite');
  const newFile = path.join(dir, 'tubescope.sqlite');
  const childEnv = { ...process.env, TUBESCOPE_DATA_DIR: dir };
  delete childEnv.TUBESCOPE_DB;
  delete childEnv.TUBEDESK_DB;
  const run = code => {
    const out = spawnSync(process.execPath, ['-e', code], { cwd: ROOT, env: childEnv, encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr);
    return out.stdout.trim();
  };
  try {
    // Exit without closing SQLite so the copied sidecars contain a committed WAL row.
    run(`import { Database } from 'bun:sqlite'; const db = new Database(${JSON.stringify(oldFile)}); db.exec("PRAGMA journal_mode=WAL; CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO settings VALUES ('migration_marker', 'preserved')"); process.exit(0);`);
    assert.ok(fs.existsSync(oldFile + '-wal'));
    assert.ok(fs.existsSync(oldFile + '-shm'));
    assert.equal(run("import { db, getSetting } from './src/db.js'; console.log(getSetting('migration_marker')); db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close(true);"), 'preserved');
    for (const ext of ['', '-wal', '-shm']) assert.equal(fs.existsSync(oldFile + ext), false);
    assert.ok(fs.existsSync(newFile));
    const backupDir = path.join(dir, 'backups');
    const backupName = run("import { create } from './src/services/backup.js'; console.log((await create()).created);");
    fs.renameSync(path.join(backupDir, backupName), path.join(backupDir, 'tubedesk-2026-11-21.sqlite'));
    run("import { list, stageRestore } from './src/services/backup.js'; if (!list().some(b => b.file === 'tubedesk-2026-11-21.sqlite')) throw Error('missing old backup'); stageRestore('tubedesk-2026-11-21.sqlite');");
    fs.unlinkSync(path.join(dir, 'restore-pending.json'));
    const old = new Database(oldFile);
    old.exec("CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO settings VALUES ('migration_marker', 'old untouched')");
    old.close(true);
    assert.equal(run("import { db, getSetting } from './src/db.js'; console.log(getSetting('migration_marker')); db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close(true);"), 'preserved');
    assert.ok(fs.existsSync(oldFile));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
