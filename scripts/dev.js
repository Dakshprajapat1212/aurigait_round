const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

console.log('🎬 Starting Multiplex Booking Counter (Backend + Frontend)...');

// 1. Start Backend
const backend = spawn('npm', ['--prefix', 'backend', 'start'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

// 2. Start Frontend
const frontend = spawn('npm', ['--prefix', 'frontend', 'run', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

function cleanup() {
  console.log('\n🛑 Shutting down servers...');
  backend.kill();
  frontend.kill();
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
