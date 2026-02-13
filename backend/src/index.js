/**
 * Gallery API: Keycloak auth, MinIO/S3 storage (one bucket per user).
 */
import express from 'express';
import cors from 'cors';
import { authMiddleware } from './auth.js';
import filesRoutes from './routes/files.js';
import authRoutes from './routes/auth.js';

const PORT = process.env.PORT || 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/files', authMiddleware, filesRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, 'localhost', () => {
  console.log(`Gallery API listening on http://localhost:${PORT}`);
});
