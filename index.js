const express = require("express");
const multer = require("multer");
const auth = require("basic-auth");
const fs = require("fs");
const path = require("path");

const app = express();
const upload = multer({ dest: "uploads/" });

const USER = "user";
const PASS = "secretpass";

// Autentisering
app.use((req, res, next) => {
  const creds = auth(req);
  if (!creds || creds.name !== USER || creds.pass !== PASS) {
    res.set("WWW-Authenticate", 'Basic realm="Upload"');
    return res.status(401).send("Unauthorized");
  }
  next();
});

// Filuppladdning (Matrixify → denna proxy)
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded");
  const filename = "latest-" + Date.now() + path.extname(req.file.originalname);
  const dest = path.join("uploads", filename);
  fs.rename(req.file.path, dest, err => {
    if (err) return res.status(500).send("File saving failed");
    res.send("File received and saved as " + filename);
  });
});

// Starta servern
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Proxy listening on port", PORT);
});
