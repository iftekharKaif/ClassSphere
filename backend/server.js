const path = require('path');
const fs = require('fs');
const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

dotenv.config({ path: path.join(__dirname, '.env') });

const { ping } = require('./db');

const authRoutes = require('./routes/auth');
const classroomRoutes = require('./routes/classrooms');
const folderRoutes = require('./routes/folders');
const announcementRoutes = require('./routes/announcements');
const resultsRoutes = require('./routes/results');

const app = express();

app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// API
app.use('/api/auth', authRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/results', resultsRoutes);

// Serve frontend static files (project root by default)
const staticDir = process.env.STATIC_DIR
  ? path.resolve(__dirname, process.env.STATIC_DIR)
  : path.resolve(__dirname, '..');
app.use(express.static(staticDir));

// Basic SPA-ish fallback (keeps direct open of HTML routes working)
app.get('/', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const port = Number(process.env.PORT || 3000);
ping()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('MySQL connected');
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server running on http://localhost:${port}`);
    });
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('MySQL connection failed:', e.message);
    process.exit(1);
  });

