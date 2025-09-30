const express = require('express');
const fs = require('fs');
const path = require('path');
let multer; // optional, only if installed
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null; // set in env for security

const app = express();

const backendDir = __dirname;
const rootDir = path.join(backendDir, '..');
const uploadsDir = path.join(backendDir, 'uploads');
const photosJsonPath = path.join(backendDir, 'photos.json');
const frontendDir = path.join(rootDir, 'frontend');
const publicDir = path.join(backendDir, 'public');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// CORS for local dev (frontend on same origin if served by this app)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-admin-password');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}));

// Alias to match /photos like in your snippet
app.use('/photos', express.static(uploadsDir));

// Serve UI
if (fs.existsSync(publicDir)) {
  app.use('/', express.static(publicDir));
} else {
  app.use('/', express.static(frontendDir));
}

// Redirect common typo to the correct file
app.get(['/idex.html', '/Idex.html'], (req, res) => res.redirect(301, '/index.html'));

// Also expose public at /public if present
if (fs.existsSync(publicDir)) app.use('/public', express.static(publicDir));

function readPhotosList() {
  try {
    const raw = fs.readFileSync(photosJsonPath, 'utf-8');
    const obj = JSON.parse(raw);
    return Array.isArray(obj) ? obj : [];
  } catch (e) {
    return [];
  }
}

function writePhotosList(list) {
  fs.writeFileSync(photosJsonPath, JSON.stringify(list, null, 2));
}

function ensurePhotosJson() {
  if (!fs.existsSync(photosJsonPath)) writePhotosList([]);
}

ensurePhotosJson();

// Try to load multer if available (so manual uploads work without installing it)
let upload;
try {
  multer = require('multer');
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'].includes(ext) ? ext : '.jpg';
      const name = crypto.randomBytes(12).toString('hex') + safeExt;
      cb(null, name);
    }
  });
  upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
      if ((file.mimetype || '').startsWith('image/')) cb(null, true);
      else cb(new Error('Only image uploads allowed'));
    },
    limits: { fileSize: 25 * 1024 * 1024 }
  });
} catch (err) {
  console.log('Multer not installed. Upload endpoint will be disabled.');
}

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return res.status(500).json({ error: 'Server missing ADMIN_TOKEN' });
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// List all photos
app.get('/api/photos', (req, res) => {
  const list = readPhotosList();
  res.json(list);
});

// Return one random photo
app.get('/api/photos/random', (req, res) => {
  const list = readPhotosList();
  if (!list.length) return res.status(404).json({ error: 'No photos' });
  const pick = list[Math.floor(Math.random() * list.length)];
  res.json(pick);
});

// Compatibility route: /random-photo with optional filters (?month=&year=)
// Prefers photos.json if available; falls back to filesystem listing
app.get('/random-photo', (req, res) => {
  const { month, year } = req.query;
  let list = readPhotosList();

  // If we have entries in photos.json, filter there
  if (Array.isArray(list) && list.length) {
    let filtered = list;
    if (year) {
      const yr = parseInt(String(year), 10);
      filtered = filtered.filter(p => {
        const d = new Date(p.uploadedAt || p.dateUploaded || 0);
        return d.getFullYear() === yr;
      });
    }
    if (month) {
      const mRaw = parseInt(String(month), 10);
      // Accept both 0-11 and 1-12 inputs
      const m = mRaw > 11 ? mRaw - 1 : mRaw;
      filtered = filtered.filter(p => {
        const d = new Date(p.uploadedAt || p.dateUploaded || 0);
        return d.getMonth() === m;
      });
    }
    if (!filtered.length) return res.status(404).json({ error: 'No photos found for this filter' });
    const pick = filtered[Math.floor(Math.random() * filtered.length)];
    return res.json({ filename: pick.filename, url: pick.url || `/photos/${pick.filename}`, uploadedAt: pick.uploadedAt || pick.dateUploaded });
  }

  // Fallback to reading uploads directory directly
  fs.readdir(uploadsDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Failed to read photos' });
    const imageFiles = (files || []).filter(name => /\.(jpe?g|png|gif|webp|avif)$/i.test(name));
    if (!imageFiles.length) return res.status(404).json({ error: 'No photos yet' });
    const randomFile = imageFiles[Math.floor(Math.random() * imageFiles.length)];
    res.json({ filename: randomFile, url: `/photos/${randomFile}` });
  });
});

// Admin upload (only if multer is available)
if (upload) {
  app.post('/api/photos/upload', requireAdmin, upload.single('photo'), (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    const list = readPhotosList();
    const item = {
      filename: file.filename,
      url: `/uploads/${file.filename}`,
      uploadedAt: new Date().toISOString()
    };
    list.push(item);
    writePhotosList(list);
    res.status(201).json(item);
  });

  // Public upload (password temporarily disabled)
  app.post('/upload', upload.single('photo'), (req, res) => {
    console.log('=== UPLOAD ENDPOINT HIT ===');
    console.log('Headers:', req.headers);
    console.log('File object:', req.file);
    
    const file = req.file;
    if (!file) {
      console.log('No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('File details:', {
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });

    const list = readPhotosList();
    const nowIso = new Date().toISOString();
    const item = {
      filename: file.filename,
      url: `/photos/${file.filename}`,
      uploadedAt: nowIso,
      dateUploaded: nowIso
    };
    list.push(item);
    writePhotosList(list);
    
    console.log('Photo saved to photos.json:', item);
    res.json({ message: 'Photo uploaded!', photo: { filename: item.filename, dateUploaded: item.dateUploaded } });
  });
}

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Error handler for clearer upload errors
app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 25MB)' });
  }
  if (err.message && /Only image uploads allowed/i.test(err.message)) {
    return res.status(400).json({ error: 'Only image files are allowed (jpg, png, gif, webp, avif)' });
  }
  return res.status(500).json({ error: err.message || 'Upload failed' });
});

app.listen(PORT, () => {
  console.log(`Photo Diary backend running on http://localhost:${PORT}`);
});


