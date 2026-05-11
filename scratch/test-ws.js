const WebSocket = require('ws');

const wsUrl = 'ws://localhost:3001/v1/realtime';

console.log('Connecting to:', wsUrl);

const ws = new WebSocket(wsUrl);

ws.on('open', function open() {
  console.log('Connected');
  ws.close();
});

ws.on('error', function error(err) {
  console.error('Error:', err);
});

ws.on('close', function close(code, reason) {
  console.log('Closed:', code, reason.toString());
});
