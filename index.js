import express from 'express';
import multer from 'multer';
import basicAuth from 'basic-auth';
import XLSX from 'xlsx';
import fetch from 'node-fetch';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const USER = 'user';
const PASS = 'secretpass';
let latestCSV = '';

const authMiddleware = (req, res, next) => {
  const creds = basicAuth(req);
  if (!creds || creds.name !== USER || creds.pass !== PASS) {
    res.set('WWW-Authenticate', 'Basic realm="Turum Proxy"');
    return res.status(401).send('Unauthorized');
  }
  next();
};

app.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');
  let lines = [];

  const buf = req.file.buffer;
  if (req.file.originalname.endsWith('.xlsx')) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheet = wb.Sheets['Products'];
    if (!sheet) return res.status(400).send("'Products'-arket saknas");
    const csv = XLSX.utils.sheet_to_csv(sheet);
    lines = csv.trim().split('\n');
  } else {
    lines = buf.toString('utf8').trim().split('\n');
  }

  const header = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const skuIndex = header.indexOf('Variant SKU');
  const handleIndex = header.indexOf('Handle');
  if (skuIndex === -1 || handleIndex === -1) {
    return res.status(400).send("Filen måste innehålla 'Variant SKU' och 'Handle'");
  }

  const tokenRes = await fetch('https://api.b2b.turum.pl/v1/account/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'contact@southsoles.se', password: 'Southsoles1234' })
  });
  const { access_token } = await tokenRes.json();
  if (!access_token) return res.status(401).send('Fel vid Turum-login');

  const prodRes = await fetch('https://api.b2b.turum.pl/v1/products_full_list', {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const prodJSON = await prodRes.json();
  const turumSKUs = new Set(prodJSON.data.flatMap(p => p.variants.map(v => `${p.sku}-${v.size}`)));

  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const sku = cols[skuIndex]?.trim();
    const handle = cols[handleIndex]?.trim();
    if (!sku || !handle) continue;
    if (!map.has(handle)) map.set(handle, []);
    map.get(handle).push(sku);
  }

  let out = '"Command","Handle"\n';
  for (const [hd, sks] of map.entries()) {
    if (!sks.some(s => turumSKUs.has(s))) {
      out += `"DELETE","${hd}"\n`;
    }
  }

  latestCSV = out;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="turum-delete.csv"');
  res.send(out);
});

app.get('/delete.csv', authMiddleware, (req, res) => {
  if (!latestCSV) return res.status(404).send('Ingen file genererad ännu');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="turum-delete.csv"');
  res.send(latestCSV);
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Turum proxy är igång');
});
