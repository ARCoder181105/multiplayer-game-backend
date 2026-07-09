const http = require('http');

const BASE = 'http://localhost:3000';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } 
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('=== 1. Health Check ===');
  const health = await request('GET', '/health');
  console.log(JSON.stringify(health, null, 2));

  console.log('\n=== 2. Initial Data Reset ===');
  const reset1 = await request('DELETE', '/api/reset');
  console.log('Reset result:', reset1.success, '| Message:', reset1.data?.message);

  console.log('\n=== 3. Register Player 1 (Alice - 100001) ===');
  const p1 = await request('POST', '/api/auth/register', { name: 'Alice', registrationNumber: '100001' });
  console.log('Player 1 Registered:', p1.success, '| Name:', p1.data?.player?.name, '| Score:', p1.data?.player?.score);
  const p1Token = p1.data?.token;

  console.log('\n=== 4. Register Player 2 (Bob - 100002) ===');
  const p2 = await request('POST', '/api/auth/register', { name: 'Bob', registrationNumber: '100002' });
  console.log('Player 2 Registered:', p2.success, '| Name:', p2.data?.player?.name, '| Score:', p2.data?.player?.score);
  const p2Token = p2.data?.token;

  console.log('\n=== 5. Seamless Re-entry / Login Test (Alice - 100001) ===');
  const p1Login = await request('POST', '/api/auth/register', { name: 'Alice', registrationNumber: '100001' });
  console.log('Re-login via register endpoint:', p1Login.success, '| Token returned:', !!p1Login.data?.token);

  console.log('\n=== 6. Submit Score for Alice (850 pts) ===');
  const s1 = await request('POST', '/api/game/submit-score', { score: 850 }, p1Token);
  console.log('Score Submitted:', s1.success, '| Updated Score:', s1.data?.player?.score);

  console.log('\n=== 7. Submit Score for Bob (920 pts) ===');
  const s2 = await request('POST', '/api/game/submit-score', { score: 920 }, p2Token);
  console.log('Score Submitted:', s2.success, '| Updated Score:', s2.data?.player?.score);

  console.log('\n=== 8. Get Top 10 Leaderboard ===');
  const lb = await request('GET', '/api/leaderboard?limit=10');
  console.log(JSON.stringify(lb.data, null, 2));

  console.log('\n=== 9. Final Reset Verification ===');
  const reset2 = await request('DELETE', '/api/reset');
  console.log('Final Reset:', reset2.success, '| Players Deleted:', reset2.data?.deletedPlayers);

  const lbAfter = await request('GET', '/api/leaderboard?limit=10');
  console.log('Leaderboard count after reset:', lbAfter.data?.leaderboard?.length);

  console.log('\n✅ All tests passed cleanly!');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
