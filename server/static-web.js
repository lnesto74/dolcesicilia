import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'app', 'dist');
const PORT = 5173;
const API = '127.0.0.1';
const API_PORT = 3001;

const app = express();

// Proxy /api/* → Mac API server (database lives here)
app.use('/api', (req, res) => {
  const opts = {
    hostname: API,
    port: API_PORT,
    path: req.originalUrl,
    method: req.method,
    headers: { ...req.headers, host: `${API}:${API_PORT}` },
  };

  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('API proxy error:', err.message);
    res.status(502).json({ error: 'Mac API server offline' });
  });

  req.pipe(proxyReq);
});

app.use(express.static(DIST, { index: false }));

const WAPP_HTML = path.join(DIST, 'wapp', 'index.html');
app.get(['/wapp', '/wapp/'], (_req, res) => {
  res.sendFile(WAPP_HTML);
});

// SPA fallback — never serve HTML for missing .js/.css/.map (wrong relative paths)
app.get('*', (req, res) => {
  if (/\.[a-z0-9]+$/i.test(req.path) && !req.path.endsWith('.html')) {
    res.status(404).send('Not found');
    return;
  }
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dolce Sicilia web → http://0.0.0.0:${PORT}`);
});
