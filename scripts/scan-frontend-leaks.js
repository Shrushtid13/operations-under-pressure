// scripts/scan-frontend-leaks.js
import fs from 'node:fs';
import path from 'node:path';

const patterns = [
  'postgres:',
  'postgresql:',
  'from \'pg\'',
  'from "pg"',
  'import pg',
  'require(\'pg\')',
  '@supabase',
  'SUPABASE',
  'app_runtime',
  'app_migrator',
  'DB_PASSWORD',
  'DATABASE_URL',
  'secret',
  'argon2'
];

let leaksFound = 0;

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        scanDir(fullPath);
      }
    } else {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const p of patterns) {
        if (content.toLowerCase().includes(p.toLowerCase())) {
          console.log(`[ALERT] Found "${p}" in ${fullPath}`);
          leaksFound++;
        }
      }
    }
  }
}

scanDir('d:\\operations\\web');
console.log(`\nScan finished. Total suspicious patterns found: ${leaksFound}`);
