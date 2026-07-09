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

  console.log('\n=== 2. Admin Login ===');
  const admin = await request('POST', '/api/admin/login', { adminSecret: 'admin-secret-change-me' });
  console.log('Admin logged in:', admin.success);
  const adminToken = admin.data.token;

  console.log('\n=== 2.5 Reset Test Data ===');
  const reset = await request('DELETE', '/api/admin/data/reset', null, adminToken);
  console.log('Data reset:', reset.success);

  console.log('\n=== 3. Create Room ===');
  const room = await request('POST', '/api/admin/rooms', { roomId: 'ROOM-001', name: 'Battle Arena', maxPlayers: 10 }, adminToken);
  console.log(JSON.stringify(room, null, 2));

  console.log('\n=== 4. Register Players ===');
  const p1 = await request('POST', '/api/auth/register', { name: 'Alice', registrationNumber: '100001' });
  console.log('Player 1:', p1.success, p1.data?.player?.name || p1.error?.message);
  const p1Token = p1.data?.token;

  const p2 = await request('POST', '/api/auth/register', { name: 'Bob', registrationNumber: '100002' });
  console.log('Player 2:', p2.success, p2.data?.player?.name || p2.error?.message);
  const p2Token = p2.data?.token;

  console.log('\n=== 5. Players Join Room ===');
  const join1 = await request('POST', '/api/game/join', { roomId: 'ROOM-001' }, p1Token);
  console.log('Alice joined:', join1.success);
  const join2 = await request('POST', '/api/game/join', { roomId: 'ROOM-001' }, p2Token);
  console.log('Bob joined:', join2.success, '| Players:', join2.data?.room?.playerCount);

  console.log('\n=== 6. Start Game ===');
  const start = await request('POST', '/api/admin/rooms/ROOM-001/start', {}, adminToken);
  console.log('Game started:', start.success, '| Status:', start.data?.room?.status);

  console.log('\n=== 7. Submit Scores ===');
  const s1 = await request('POST', '/api/game/submit-score', { roomId: 'ROOM-001', score: 850 }, p1Token);
  console.log('Alice score submitted:', s1.success);
  const s2 = await request('POST', '/api/game/submit-score', { roomId: 'ROOM-001', score: 720 }, p2Token);
  console.log('Bob score submitted:', s2.success);

  console.log('\n=== 8. Scoreboard ===');
  const board = await request('GET', '/api/game/scoreboard/ROOM-001', null, p1Token);
  console.log(JSON.stringify(board.data, null, 2));

  console.log('\n=== 9. End Game ===');
  const end = await request('POST', '/api/admin/rooms/ROOM-001/end', {}, adminToken);
  console.log('Winner:', end.data?.results?.winner?.name, '| Score:', end.data?.results?.winner?.score);

  console.log('\n=== 10. Leaderboard ===');
  const lb = await request('GET', '/api/leaderboard');
  console.log(JSON.stringify(lb.data, null, 2));

  console.log('\n=== 11. Player Profile ===');
  const profile = await request('GET', '/api/auth/profile', null, p1Token);
  console.log(JSON.stringify(profile, null, 2));

  console.log('\n=== 12. Validation Test (bad regNo) ===');
  const bad = await request('POST', '/api/auth/register', { name: 'Test', registrationNumber: '123' });
  console.log('Expected error:', bad.error?.message);

  console.log('\n=== 13. Duplicate Registration Test ===');
  const dup = await request('POST', '/api/auth/register', { name: 'Alice2', registrationNumber: '100001' });
  console.log('Expected error:', dup.error?.message);

  console.log('\n✅ All tests passed!');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
