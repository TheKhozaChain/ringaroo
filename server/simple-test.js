const http = require('http');
const server = http.createServer((req, res) => {
  console.log('Request received:', req.url);
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello World\n');
});
server.listen(3000, '0.0.0.0', () => {
  console.log('Simple server running on port 3000');
});