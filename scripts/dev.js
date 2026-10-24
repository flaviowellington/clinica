// Sobe a API e o front juntos; Ctrl+C encerra os dois.
import { spawn } from 'node:child_process'

for (const ws of ['server', 'web']) {
  spawn(`npm run dev -w ${ws}`, { stdio: ['ignore', 'inherit', 'inherit'], shell: true })
}
