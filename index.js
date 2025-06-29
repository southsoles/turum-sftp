import express from "express";
import multer from "multer";
import auth from "basic-auth";
import XLSX from "xlsx";
import fs from "fs";
import https from "https";

// === Setup ===
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;
let latestCSV = "";

// === Enkel Basic Auth ===
const checkAuth = (req, res, next) => {
  const creds = auth(req);
  if (!creds || creds.name !== "user" || creds.pass !== "secretpass") {
    res.set("WWW-Authenticate", 'Basic realm="Protected"');
    return res.status(401).send("Unauthorized");
  }
  next();
};

// === GET för att hämta genererad fil ===
app.get("/delete.csv", checkAuth, (req, res) => {
  if (!latestCSV) return res.status(404).send("Ingen fil genererad ännu");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="turum-delete.csv"');
  res.send(latestCSV);
});

// === POST från Matrixify med Excel- eller CSV-fil ===
app.post("/upload", checkAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).send("Ingen fil bifogad");

  let lines = [];
  if (req.file.originalname.endsWith(".xlsx")) {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets["Products"];
    if (!sheet) return res.status(400).send("'Products'-arket saknas");
    const csv = XLSX.utils.sheet_to_csv(sheet);
    lines = csv.trim().split("\n");
  } else {
    lines = req.file.buffer.toString("utf8").trim().split("\n");
  }

  const header = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
  const skuIndex = header.indexOf("Variant SKU");
  const handleIndex = header.indexOf("Handle");
  if (skuIndex === -1 || handleIndex === -1) {
    return res.status(400).send("Filen måste innehålla 'Variant SKU' och 'Handle'");
  }

  // === Hämta Turum-data ===
  const token = await fetchToken();
  const turumSkus = await fetchTurumSkus(token);

  // === Matchning & filtrering ===
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    const sku = row[skuIndex]?.replace(/^"|"$/g, "").trim();
    const handle = row[handleIndex]?.replace(/^"|"$/g, "").trim();
    if (!sku || !handle) continue;
    if (!map.has(handle)) map.set(handle, []);
    map.get(handle).push(sku);
  }

  let csv = '"Command","Handle"\n';
  for (const [handle, skus] of map.entries()) {
    const match = skus.some(sku => turumSkus.has(sku));
    if (!match) csv += `"DELETE","${handle}"\n`;
  }

  latestCSV = csv;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="turum-delete.csv"');
  res.send(csv);
});

// === Hjälpfunktioner ===
async function fetchToken() {
  const res = await fetch("https://api.b2b.turum.pl/v1/account/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "contact@southsoles.se",
      password: "Southsoles1234"
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function fetchTurumSkus(token) {
  const res = await fetch("https://api.b2b.turum.pl/v1/products_full_list", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return new Set(data.data.flatMap(p => p.variants.map(v => `${p.sku}-${v.size}`)));
}

// === Starta servern ===
app.listen(PORT, () => {
  console.log("🚀 Servern körs på port", PORT);
});

