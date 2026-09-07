import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
try {
 await access('.env');
 console.log('.env sudah ada; konfigurasi dipertahankan.');
} catch {
 const example=await readFile('.env.example','utf8');
 await writeFile('.env',example.replace('replace-with-a-random-secret-of-at-least-32-characters',randomBytes(48).toString('base64url')),{flag:'wx'});
 console.log('.env dibuat dengan JWT secret acak.');
}
