const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, encoded) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded || '')) return false;
  const [salt, hash] = encoded.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}
module.exports = { hashPassword, verifyPassword };

if (require.main === module) {
  if (!process.stdin.isTTY) throw new Error('Run this command in an interactive terminal.');
  process.stdout.write('New admin password (at least 14 characters): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  let password = '';
  process.stdin.on('data', chunk => {
    for (const character of chunk) {
      if (character === '\u0003') { process.stdin.setRawMode(false); process.exit(1); }
      if (character === '\r' || character === '\n') {
        process.stdin.setRawMode(false);
        if (password.length < 14 || password.length > 256) { console.error('\nUse 14–256 characters.'); process.exit(1); }
        console.log(`\nSet this in .env:\nADMIN_PASSWORD_HASH=${hashPassword(password)}`);
        process.exit(0);
      }
      if (character === '\u007f' || character === '\b') password = password.slice(0, -1);
      else if (character >= ' ') password += character;
    }
  });
}
