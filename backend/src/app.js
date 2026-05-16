const path = require('path');
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerDocs = require('./config/swagger');
const routes = require('./routes');

const app = express();

// Middlewares
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,    // http://64.176.80.227:3001
    'http://64.176.80.227',      // truy cập qua port 80
  ].filter(Boolean),
  credentials: true,
}));
app.use(express.json());

// Access log for API requests to make web actions traceable in backend terminal.
app.use((req, res, next) => {
  if (!req.originalUrl.startsWith('/api') || req.method === 'OPTIONS') {
    return next();
  }

  const startedAt = process.hrtime.bigint();
  const bodyKeys = req.body && typeof req.body === 'object' ? Object.keys(req.body) : [];

  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const actor = req.user ? `user=${req.user.id} role=${req.user.role}` : 'user=guest';
    const payloadInfo = bodyKeys.length ? ` payload_keys=[${bodyKeys.join(',')}]` : '';

    console.log(
      `[HTTP] ${new Date().toISOString()} ${req.method} ${req.originalUrl} -> ${res.statusCode} ${elapsedMs.toFixed(1)}ms ${actor}${payloadInfo}`
    );
  });

  return next();
});

// Phục vụ file tĩnh (ảnh đại diện)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerDocs);
});

// Đăng ký tất cả Routes qua 1 điểm duy nhất
app.use('/api', routes);

// Route mặc định
app.get('/', (req, res) => res.send('IoT Health Backend is Running...'));

module.exports = app;