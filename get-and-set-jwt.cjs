const fs = require('fs');
const path = require('path');
const readline = require('readline');
const request = require('supertest');

const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const DEMO_EMAIL = 'demo@healthyflow.com';
const TESTS_DIR = path.join(__dirname, 'tests', 'features');

async function promptPassword() {
  if (process.env.DEMO_PASSWORD) return process.env.DEMO_PASSWORD;
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.stdoutMuted = true;
    rl.question('Enter demo user password: ', (password) => {
      rl.close();
      resolve(password);
    });
    rl._writeToOutput = function _writeToOutput(stringToWrite) {
      if (rl.stdoutMuted) rl.output.write("*");
      else rl.output.write(stringToWrite);
    };
  });
}

async function getToken(email, password) {
  const res = await request(API_URL)
    .post('/auth/login')
    .send({ email, password });
  if (!res.body.token) {
    throw new Error('Failed to get token: ' + JSON.stringify(res.body));
  }
  return res.body.token;
}

function updateTestFiles(token) {
  const files = fs.readdirSync(TESTS_DIR).filter(f => f.endsWith('.js'));
  files.forEach(file => {
    const filePath = path.join(TESTS_DIR, file);
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/const token = '.*?';/g, `const token = '${token}';`);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Updated token in ${file}`);
  });
}

(async () => {
  try {
    const password = await promptPassword();
    const token = await getToken(DEMO_EMAIL, password);
    console.log('\n✅ Got JWT token:', token.slice(0, 32) + '...');
    updateTestFiles(token);
    console.log('\nAll test files updated with new token!');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})(); 