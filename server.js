// Creche website backend: public vacancies + applications, password-protected admin.
// Run: npm install && ADMIN_PASSWORD=yourpassword npm start

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");

if (ADMIN_PASSWORD === "changeme") {
  console.warn("WARNING: using the default admin password. Set ADMIN_PASSWORD before going live.");
}

app.use(express.json({ limit: "50kb" }));
app.use(express.static(path.join(__dirname, "public")));

/* ---------- data store (JSON file) ---------- */

const defaults = {
  settings: {
    name: "Little Steps Creche",
    tagline: "A safe, warm place to learn and play.",
    phone: "",
    email: "",
    address: "",
    hours: "Monday to Friday, 06:30 to 17:30",
    applicationsOpen: true,
    statusNote: "Applications for the new year are open. We reply within 3 working days.",
    lastUpdated: new Date().toISOString(),
  },
  groups: [
    { id: "g1", name: "Babies", ageRange: "3 to 12 months", capacity: 8, enrolled: 6 },
    { id: "g2", name: "Toddlers", ageRange: "1 to 2 years", capacity: 15, enrolled: 15 },
    { id: "g3", name: "Preschool", ageRange: "3 to 5 years", capacity: 25, enrolled: 19 },
  ],
  applications: [],
};

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    save(defaults);
    return JSON.parse(JSON.stringify(defaults));
  }
}
function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* ---------- helpers ---------- */

const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const toInt = (v, min, max) => Math.max(min, Math.min(max, parseInt(v, 10) || 0));

const tokens = new Map(); // token -> expiry
const TOKEN_TTL = 1000 * 60 * 60 * 8;

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const exp = tokens.get(token);
  if (!exp || exp < Date.now()) {
    tokens.delete(token);
    return res.status(401).json({ error: "Please log in again." });
  }
  next();
}

// very small in-memory rate limiter
const hits = new Map();
function limit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      return res.status(429).json({ error: "Too many attempts. Please try again later." });
    }
    list.push(now);
    hits.set(key, list);
    next();
  };
}

/* ---------- public API ---------- */

app.get("/api/info", (req, res) => {
  const { settings, groups } = load();
  res.json({
    settings,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      ageRange: g.ageRange,
      capacity: g.capacity,
      enrolled: g.enrolled,
      spaces: Math.max(0, g.capacity - g.enrolled),
    })),
  });
});

app.post("/api/apply", limit(5, 1000 * 60 * 15), (req, res) => {
  const data = load();
  if (!data.settings.applicationsOpen) {
    return res.status(403).json({ error: "Applications are currently closed." });
  }
  const b = req.body || {};
  const app_ = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "new",
    parentName: clean(b.parentName, 100),
    phone: clean(b.phone, 30),
    email: clean(b.email, 120),
    childName: clean(b.childName, 100),
    childBirthDate: clean(b.childBirthDate, 20),
    groupId: clean(b.groupId, 20),
    message: clean(b.message, 1000),
  };
  if (!app_.parentName || !app_.phone || !app_.childName || !app_.childBirthDate) {
    return res.status(400).json({ error: "Please fill in your name, phone number, and your child's name and birth date." });
  }
  if (!data.groups.some((g) => g.id === app_.groupId)) {
    return res.status(400).json({ error: "Please choose an age group." });
  }
  data.applications.unshift(app_);
  save(data);
  res.json({ ok: true });
});

/* ---------- admin API ---------- */

app.post("/api/admin/login", limit(10, 1000 * 60 * 15), (req, res) => {
  const given = Buffer.from(String(req.body?.password || ""));
  const real = Buffer.from(ADMIN_PASSWORD);
  const ok = given.length === real.length && crypto.timingSafeEqual(given, real);
  if (!ok) return res.status(401).json({ error: "Wrong password." });
  const token = crypto.randomBytes(24).toString("hex");
  tokens.set(token, Date.now() + TOKEN_TTL);
  res.json({ token });
});

app.get("/api/admin/data", requireAdmin, (req, res) => {
  res.json(load());
});

app.put("/api/admin/settings", requireAdmin, (req, res) => {
  const data = load();
  const b = req.body || {};
  const s = data.settings;
  s.name = clean(b.name, 80) || s.name;
  s.tagline = clean(b.tagline, 160);
  s.phone = clean(b.phone, 30);
  s.email = clean(b.email, 120);
  s.address = clean(b.address, 200);
  s.hours = clean(b.hours, 120);
  s.statusNote = clean(b.statusNote, 300);
  s.applicationsOpen = !!b.applicationsOpen;
  s.lastUpdated = new Date().toISOString();
  save(data);
  res.json({ ok: true, settings: s });
});

app.put("/api/admin/groups", requireAdmin, (req, res) => {
  const data = load();
  const incoming = Array.isArray(req.body?.groups) ? req.body.groups.slice(0, 12) : [];
  data.groups = incoming
    .map((g, i) => {
      const capacity = toInt(g.capacity, 0, 500);
      return {
        id: clean(g.id, 20) || "g" + Date.now() + i,
        name: clean(g.name, 60),
        ageRange: clean(g.ageRange, 60),
        capacity,
        enrolled: Math.min(toInt(g.enrolled, 0, 500), capacity),
      };
    })
    .filter((g) => g.name);
  data.settings.lastUpdated = new Date().toISOString();
  save(data);
  res.json({ ok: true, groups: data.groups });
});

app.patch("/api/admin/applications/:id", requireAdmin, (req, res) => {
  const data = load();
  const a = data.applications.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: "Not found." });
  const status = clean(req.body?.status, 20);
  if (!["new", "contacted", "waitlist", "accepted", "declined"].includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }
  a.status = status;
  save(data);
  res.json({ ok: true });
});

app.delete("/api/admin/applications/:id", requireAdmin, (req, res) => {
  const data = load();
  data.applications = data.applications.filter((x) => x.id !== req.params.id);
  save(data);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Creche site running on port ${PORT}`));
