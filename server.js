const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

function parseEnvBoolean(rawValue, fallback = false) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }

  const normalized = String(rawValue).trim().toLowerCase();
  if (["true", "1", "yes", "on", "aktif"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off", "pasif"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const APP_NAME = String(process.env.APP_NAME || "BYTS").trim() || "BYTS";
const PUBLIC_BASE_URL = trimTrailingSlash(process.env.PUBLIC_BASE_URL || "");
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const RESET_REQUESTS_FILE = path.join(DATA_DIR, "reset-requests.json");
const DEVICE_TIMEOUT_MS = 45_000;
const MAX_EVENTS = 250;
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_CODE_MAX_ATTEMPTS = 5;
const RESET_REQUEST_COOLDOWN_MS = Number(process.env.RESET_REQUEST_COOLDOWN_MS || 60_000);
const ALLOW_DEMO_RESET_CODES = parseEnvBoolean(
  process.env.ALLOW_DEMO_RESET_CODES,
  NODE_ENV !== "production",
);
const RESET_SMS_WEBHOOK_URL = String(process.env.RESET_SMS_WEBHOOK_URL || "").trim();
const RESET_EMAIL_WEBHOOK_URL = String(process.env.RESET_EMAIL_WEBHOOK_URL || "").trim();
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const RESEND_FROM_EMAIL = String(process.env.RESEND_FROM_EMAIL || "").trim();
const TWILIO_ACCOUNT_SID = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
const TWILIO_AUTH_TOKEN = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_FROM_PHONE = String(process.env.TWILIO_FROM_PHONE || "").trim();

const sseClients = new Set();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".ino": "text/plain; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function isoNow() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeEmail(value) {
  return normalizeText(value);
}

function maskPhone(value) {
  const digits = normalizePhone(value);
  if (!digits) {
    return "kayitli telefon";
  }
  const tail = digits.slice(-4).padStart(4, "*");
  return `*** *** ${tail.slice(0, 2)} ${tail.slice(2)}`;
}

function maskEmail(value) {
  const email = String(value || "").trim();
  const [localPart = "", domainPart = ""] = email.split("@");
  if (!localPart || !domainPart) {
    return "kayitli e-posta";
  }
  const maskedLocal =
    localPart.length <= 2
      ? `${localPart[0] || "*"}*`
      : `${localPart.slice(0, 2)}***`;
  return `${maskedLocal}@${domainPart}`;
}

function generateResetCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getResetProviderStatus() {
  return {
    demoCodesEnabled: ALLOW_DEMO_RESET_CODES,
    emailConfigured: Boolean(
      RESET_EMAIL_WEBHOOK_URL || (RESEND_API_KEY && RESEND_FROM_EMAIL),
    ),
    smsConfigured: Boolean(
      RESET_SMS_WEBHOOK_URL ||
        (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_PHONE),
    ),
  };
}

function formatMinutesFromNow(expiresAt) {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  const minutes = Math.max(1, Math.ceil(diffMs / 60_000));
  return `${minutes} dakika`;
}

async function postJson(url, payload, extraHeaders = {}) {
  const response = await fetch(url, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    method: "POST",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Harici servis ${response.status} hatasi dondu.`);
  }

  return response;
}

async function sendResetCodeByWebhook(channel, target, payload) {
  const webhookUrl = channel === "email" ? RESET_EMAIL_WEBHOOK_URL : RESET_SMS_WEBHOOK_URL;
  if (!webhookUrl) {
    return false;
  }

  await postJson(webhookUrl, {
    ...payload,
    channel,
    target,
  });
  return true;
}

async function sendResetCodeByResend(user, code, expiresAt) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL || !user.email) {
    return false;
  }

  const expiresIn = formatMinutesFromNow(expiresAt);
  const subject = `${APP_NAME} sifre sifirlama kodu`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717">
      <h2 style="margin:0 0 12px">${APP_NAME}</h2>
      <p>Merhaba ${user.displayName},</p>
      <p>Tek kullanimlik sifre sifirlama kodunuz hazir:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">${code}</p>
      <p>Bu kod ${expiresIn} boyunca gecerlidir.</p>
      ${
        PUBLIC_BASE_URL
          ? `<p>Panel baglantisi: <a href="${PUBLIC_BASE_URL}">${PUBLIC_BASE_URL}</a></p>`
          : ""
      }
      <p>Eger bu islemi siz baslatmadiysaniz bu mesaji dikkate almayin.</p>
    </div>
  `;
  const text = [
    `${APP_NAME} sifre sifirlama kodu`,
    "",
    `Merhaba ${user.displayName},`,
    `Kodunuz: ${code}`,
    `Gecerlilik suresi: ${expiresIn}`,
    PUBLIC_BASE_URL ? `Panel: ${PUBLIC_BASE_URL}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      html,
      subject,
      text,
      to: [user.email],
    }),
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Resend e-posta gonderimi basarisiz oldu.");
  }

  return true;
}

async function sendResetCodeByTwilio(user, code, expiresAt) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_PHONE || !user.phone) {
    return false;
  }

  const expiresIn = formatMinutesFromNow(expiresAt);
  const body = `${APP_NAME} sifre sifirlama kodunuz: ${code}. Kod ${expiresIn} gecerlidir.`;
  const authToken = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      body: new URLSearchParams({
        Body: body,
        From: TWILIO_FROM_PHONE,
        To: user.phone,
      }),
      headers: {
        Authorization: `Basic ${authToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Twilio SMS gonderimi basarisiz oldu.");
  }

  return true;
}

async function deliverResetCode({ channel, code, deliveryHint, expiresAt, user }) {
  const payload = {
    appName: APP_NAME,
    code,
    deliveryHint,
    expiresAt,
    publicBaseUrl: PUBLIC_BASE_URL,
    user: sanitizeUser(user),
  };

  if (channel === "email") {
    if (await sendResetCodeByWebhook("email", user.email, payload)) {
      return { deliveryMode: "live", provider: "webhook" };
    }
    if (await sendResetCodeByResend(user, code, expiresAt)) {
      return { deliveryMode: "live", provider: "resend" };
    }
  } else {
    if (await sendResetCodeByWebhook("sms", user.phone, payload)) {
      return { deliveryMode: "live", provider: "webhook" };
    }
    if (await sendResetCodeByTwilio(user, code, expiresAt)) {
      return { deliveryMode: "live", provider: "twilio" };
    }
  }

  if (ALLOW_DEMO_RESET_CODES) {
    console.log(`[BYTS demo reset code] ${user.username}/${channel}: ${code}`);
    return {
      deliveryMode: "demo",
      previewCode: code,
      provider: "demo",
    };
  }

  throw new Error(
    channel === "email"
      ? "E-posta servisi tanimli degil. Resend veya e-posta webhook ayarini yap."
      : "SMS servisi tanimli degil. Twilio veya SMS webhook ayarini yap.",
  );
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function clampNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on", "aktif"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off", "pasif"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function buildDefaultSettings() {
  return {
    notifications: {
      door: true,
      fall: true,
      gas: true,
      motion: true,
      temperature: true,
    },
    thresholds: {
      darkLux: 80,
      doorOpenTooLongSec: 90,
      gasHighPpm: 420,
      smokeHighPpm: 120,
      temperatureHighC: 30,
    },
    caretaker: {
      name: "Vasi Kullanici",
      phone: "+90 555 000 00 00",
      relation: "Aile Yakini",
    },
  };
}

function buildDefaultDevices(now) {
  return {
    "camera-module": {
      id: "camera-module",
      label: "Kamera Modulu",
      online: true,
      source: "camera",
      lastPayloadAt: now,
      lastSeenAt: now,
    },
    "esp32-main": {
      id: "esp32-main",
      label: "ESP32 Sensor Hub",
      online: true,
      source: "esp32",
      lastPayloadAt: now,
      lastSeenAt: now,
    },
    "raspberry-pi-4": {
      id: "raspberry-pi-4",
      label: "Raspberry Pi 4",
      online: true,
      source: "raspberry-pi",
      lastPayloadAt: now,
      lastSeenAt: now,
    },
  };
}

function buildDefaultState() {
  const now = isoNow();
  return {
    activeAlerts: [],
    current: {
      braceletBatteryPct: 84,
      cameraConfidence: 0.04,
      doorOpen: false,
      doorOpenedAt: null,
      fallDetected: false,
      gasPpm: 110,
      heartRateBpm: 102,
      humidity: 46,
      lightLevelLux: 210,
      lightOn: true,
      motionDetected: false,
      personExited: false,
      smokePpm: 8,
      spo2: 97,
      stepCount: 5342,
      stepGoal: 5000,
      stoveOn: false,
      temperatureC: 24.2,
    },
    devices: buildDefaultDevices(now),
    meta: {
      flags: {
        darkMotion: false,
        doorOpenLong: false,
        fall: false,
        gas: false,
        temperature: false,
      },
      lastIngestAt: now,
      lastScenario: "normal",
      lastStateWriteAt: now,
    },
    summary: {
      doorOpenDurationSec: 0,
      emergencyLightOn: false,
      lastExitAt: null,
      lastUpdateAt: now,
      overallStatus: "normal",
      statusMessage: "Tum sistemler normal gorunuyor.",
    },
  };
}

function buildSeedEvents() {
  const now = Date.now();
  return [
    {
      id: makeId("evt"),
      message: "Canli izleme altyapisi hazir. Sensorden gelecek ilk veri bekleniyor.",
      severity: "info",
      source: "system",
      timestamp: new Date(now - 15 * 60 * 1000).toISOString(),
      title: "Platform baslatildi",
      type: "system-ready",
    },
    {
      id: makeId("evt"),
      message: "Varsayilan sensor profili yuklendi ve esik degerleri aktif edildi.",
      severity: "info",
      source: "system",
      timestamp: new Date(now - 10 * 60 * 1000).toISOString(),
      title: "Ayarlar aktif",
      type: "settings-loaded",
    },
  ];
}

function buildSeedUsers() {
  return [
    {
      createdAt: isoNow(),
      displayName: "Demo Vasi",
      email: "demo@byts.local",
      passwordHash: hashPassword("1234"),
      phone: "+90 555 000 00 00",
      relation: "Aile Yakini",
      role: "caretaker",
      username: "demo",
    },
  ];
}

function buildSeedResetRequests() {
  return [];
}

function normalizeSettings(rawSettings) {
  const defaults = buildDefaultSettings();
  return {
    notifications: {
      door: asBoolean(rawSettings?.notifications?.door, defaults.notifications.door),
      fall: asBoolean(rawSettings?.notifications?.fall, defaults.notifications.fall),
      gas: asBoolean(rawSettings?.notifications?.gas, defaults.notifications.gas),
      motion: asBoolean(rawSettings?.notifications?.motion, defaults.notifications.motion),
      temperature: asBoolean(
        rawSettings?.notifications?.temperature,
        defaults.notifications.temperature,
      ),
    },
    thresholds: {
      darkLux: clampNumber(rawSettings?.thresholds?.darkLux, defaults.thresholds.darkLux),
      doorOpenTooLongSec: clampNumber(
        rawSettings?.thresholds?.doorOpenTooLongSec,
        defaults.thresholds.doorOpenTooLongSec,
      ),
      gasHighPpm: clampNumber(rawSettings?.thresholds?.gasHighPpm, defaults.thresholds.gasHighPpm),
      smokeHighPpm: clampNumber(
        rawSettings?.thresholds?.smokeHighPpm,
        defaults.thresholds.smokeHighPpm,
      ),
      temperatureHighC: clampNumber(
        rawSettings?.thresholds?.temperatureHighC,
        defaults.thresholds.temperatureHighC,
      ),
    },
    caretaker: {
      name: String(rawSettings?.caretaker?.name || defaults.caretaker.name),
      phone: String(rawSettings?.caretaker?.phone || defaults.caretaker.phone),
      relation: String(rawSettings?.caretaker?.relation || defaults.caretaker.relation),
    },
  };
}

function normalizeState(rawState) {
  const defaults = buildDefaultState();
  return {
    activeAlerts: Array.isArray(rawState?.activeAlerts) ? rawState.activeAlerts : defaults.activeAlerts,
    current: {
      braceletBatteryPct: clampNumber(
        rawState?.current?.braceletBatteryPct,
        defaults.current.braceletBatteryPct,
      ),
      cameraConfidence: clampNumber(rawState?.current?.cameraConfidence, defaults.current.cameraConfidence),
      doorOpen: asBoolean(rawState?.current?.doorOpen, defaults.current.doorOpen),
      doorOpenedAt: rawState?.current?.doorOpenedAt || defaults.current.doorOpenedAt,
      fallDetected: asBoolean(rawState?.current?.fallDetected, defaults.current.fallDetected),
      gasPpm: clampNumber(rawState?.current?.gasPpm, defaults.current.gasPpm),
      heartRateBpm: clampNumber(rawState?.current?.heartRateBpm, defaults.current.heartRateBpm),
      humidity: clampNumber(rawState?.current?.humidity, defaults.current.humidity),
      lightLevelLux: clampNumber(rawState?.current?.lightLevelLux, defaults.current.lightLevelLux),
      lightOn: asBoolean(rawState?.current?.lightOn, defaults.current.lightOn),
      motionDetected: asBoolean(rawState?.current?.motionDetected, defaults.current.motionDetected),
      personExited: asBoolean(rawState?.current?.personExited, defaults.current.personExited),
      smokePpm: clampNumber(rawState?.current?.smokePpm, defaults.current.smokePpm),
      spo2: clampNumber(rawState?.current?.spo2, defaults.current.spo2),
      stepCount: clampNumber(rawState?.current?.stepCount, defaults.current.stepCount),
      stepGoal: clampNumber(rawState?.current?.stepGoal, defaults.current.stepGoal),
      stoveOn: asBoolean(rawState?.current?.stoveOn, defaults.current.stoveOn),
      temperatureC: clampNumber(rawState?.current?.temperatureC, defaults.current.temperatureC),
    },
    devices:
      rawState?.devices && typeof rawState.devices === "object"
        ? rawState.devices
        : defaults.devices,
    meta: {
      flags:
        rawState?.meta?.flags && typeof rawState.meta.flags === "object"
          ? rawState.meta.flags
          : defaults.meta.flags,
      lastIngestAt: rawState?.meta?.lastIngestAt || defaults.meta.lastIngestAt,
      lastScenario: rawState?.meta?.lastScenario || defaults.meta.lastScenario,
      lastStateWriteAt: rawState?.meta?.lastStateWriteAt || defaults.meta.lastStateWriteAt,
    },
    summary: {
      doorOpenDurationSec: clampNumber(
        rawState?.summary?.doorOpenDurationSec,
        defaults.summary.doorOpenDurationSec,
      ),
      emergencyLightOn: asBoolean(
        rawState?.summary?.emergencyLightOn,
        defaults.summary.emergencyLightOn,
      ),
      lastExitAt: rawState?.summary?.lastExitAt || defaults.summary.lastExitAt,
      lastUpdateAt: rawState?.summary?.lastUpdateAt || defaults.summary.lastUpdateAt,
      overallStatus: rawState?.summary?.overallStatus || defaults.summary.overallStatus,
      statusMessage: rawState?.summary?.statusMessage || defaults.summary.statusMessage,
    },
  };
}

function normalizeEvents(rawEvents) {
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    return buildSeedEvents();
  }

  return rawEvents
    .map((event) => ({
      id: event.id || makeId("evt"),
      message: String(event.message || ""),
      readings: event.readings && typeof event.readings === "object" ? event.readings : undefined,
      severity: event.severity || "info",
      source: event.source || "system",
      timestamp: event.timestamp || isoNow(),
      title: String(event.title || "Sistem bildirimi"),
      type: event.type || "system",
    }))
    .slice(0, MAX_EVENTS);
}

function normalizeUsers(rawUsers) {
  const seedUsers = buildSeedUsers();
  const source = Array.isArray(rawUsers) && rawUsers.length > 0 ? rawUsers : seedUsers;
  return source.map((user) => ({
    createdAt: user.createdAt || isoNow(),
    displayName: String(user.displayName || user.username || "Vasi Kullanici"),
    email: String(user.email || "").trim(),
    passwordHash: String(user.passwordHash || hashPassword("1234")),
    phone: String(user.phone || ""),
    relation: String(user.relation || "Aile Yakini"),
    role: String(user.role || "caretaker"),
    username: String(user.username || "").trim(),
  }));
}

function normalizeResetRequests(rawRequests) {
  const now = Date.now();
  if (!Array.isArray(rawRequests)) {
    return [];
  }

  return rawRequests
    .map((request) => ({
      attemptsLeft: clampNumber(request.attemptsLeft, RESET_CODE_MAX_ATTEMPTS),
      channel: request.channel === "email" ? "email" : "sms",
      codeHash: String(request.codeHash || ""),
      createdAt: request.createdAt || isoNow(),
      deliveryHint: String(request.deliveryHint || ""),
      expiresAt: request.expiresAt || isoNow(),
      username: String(request.username || "").trim(),
    }))
    .filter(
      (request) =>
        request.username &&
        request.codeHash &&
        request.attemptsLeft > 0 &&
        new Date(request.expiresAt).getTime() > now,
    );
}

function sanitizeUser(user) {
  return {
    createdAt: user.createdAt,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    relation: user.relation,
    role: user.role,
    username: user.username,
  };
}

function findUser(username) {
  const normalized = normalizeText(username);
  return users.find((user) => user.username.toLowerCase() === normalized);
}

function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }
  return users.find((user) => normalizeEmail(user.email) === normalized);
}

function cleanupResetRequests() {
  const now = Date.now();
  resetRequests = resetRequests.filter(
    (request) =>
      request.attemptsLeft > 0 && new Date(request.expiresAt).getTime() > now,
  );
}

function findResetRequest(username) {
  cleanupResetRequests();
  const normalized = normalizeText(username);
  return resetRequests.find((request) => normalizeText(request.username) === normalized);
}

function upsertResetRequest(request) {
  resetRequests = resetRequests.filter(
    (item) => normalizeText(item.username) !== normalizeText(request.username),
  );
  resetRequests.unshift(request);
}

ensureDataDir();

let settings = normalizeSettings(readJson(SETTINGS_FILE, buildDefaultSettings()));
let state = normalizeState(readJson(STATE_FILE, buildDefaultState()));
let events = normalizeEvents(readJson(EVENTS_FILE, buildSeedEvents()));
let users = normalizeUsers(readJson(USERS_FILE, buildSeedUsers()));
let resetRequests = normalizeResetRequests(
  readJson(RESET_REQUESTS_FILE, buildSeedResetRequests()),
);

function persistAll() {
  cleanupResetRequests();
  state.meta.lastStateWriteAt = isoNow();
  writeJson(STATE_FILE, state);
  writeJson(SETTINGS_FILE, settings);
  writeJson(EVENTS_FILE, events);
  writeJson(USERS_FILE, users);
  writeJson(RESET_REQUESTS_FILE, resetRequests);
}

function pushEvent(event) {
  const enriched = {
    id: event.id || makeId("evt"),
    message: event.message,
    readings: event.readings,
    severity: event.severity || "info",
    source: event.source || "system",
    timestamp: event.timestamp || isoNow(),
    title: event.title,
    type: event.type || "system",
  };

  events.unshift(enriched);
  if (events.length > MAX_EVENTS) {
    events = events.slice(0, MAX_EVENTS);
  }
  return enriched;
}

function getDoorOpenDurationSec() {
  if (!state.current.doorOpen || !state.current.doorOpenedAt) {
    return 0;
  }
  const elapsedMs = Date.now() - new Date(state.current.doorOpenedAt).getTime();
  return Math.max(0, Math.round(elapsedMs / 1000));
}

function updateDevice(deviceId, source, timestamp) {
  const now = timestamp || isoNow();
  const normalizedId = deviceId || source || "unknown-device";
  if (!state.devices[normalizedId]) {
    state.devices[normalizedId] = {
      id: normalizedId,
      label: normalizedId,
      online: true,
      source: source || "unknown",
      lastPayloadAt: now,
      lastSeenAt: now,
    };
  }

  state.devices[normalizedId] = {
    ...state.devices[normalizedId],
    online: true,
    source: source || state.devices[normalizedId].source || "unknown",
    lastPayloadAt: now,
    lastSeenAt: now,
  };
}

function buildFlags() {
  const doorOpenDurationSec = getDoorOpenDurationSec();
  return {
    darkMotion:
      state.current.motionDetected &&
      state.current.lightLevelLux <= settings.thresholds.darkLux,
    doorOpenLong:
      state.current.doorOpen &&
      doorOpenDurationSec >= settings.thresholds.doorOpenTooLongSec,
    fall:
      state.current.fallDetected ||
      state.current.cameraConfidence >= 0.85,
    gas:
      state.current.gasPpm >= settings.thresholds.gasHighPpm ||
      state.current.smokePpm >= settings.thresholds.smokeHighPpm,
    temperature: state.current.temperatureC >= settings.thresholds.temperatureHighC,
  };
}

function buildActiveAlerts(flags) {
  const alerts = [];

  if (flags.fall) {
    alerts.push({
      id: makeId("alert"),
      message: "Ani dusme tespit edildi. Vasinin hemen kontrol etmesi onerilir.",
      severity: "critical",
      title: "Kritik dusme uyarisi",
      type: "fall",
    });
  }

  if (flags.gas) {
    alerts.push({
      id: makeId("alert"),
      message: "Gaz veya duman seviyesi esik degerin ustune cikti.",
      severity: "high",
      title: "Gaz / duman uyarisi",
      type: "gas",
    });
  }

  if (flags.temperature) {
    alerts.push({
      id: makeId("alert"),
      message: "Ortam sicakligi kritik esige yaklasti veya asti.",
      severity: "medium",
      title: "Yuksek sicaklik",
      type: "temperature",
    });
  }

  if (flags.doorOpenLong) {
    alerts.push({
      id: makeId("alert"),
      message: "Kapi uzun suredir acik. Evden cikis veya guvenlik riski olabilir.",
      severity: "medium",
      title: "Kapi acik kaldi",
      type: "door",
    });
  }

  return alerts;
}

function transitionEvent(flagName, active, config) {
  const previous = Boolean(state.meta.flags?.[flagName]);
  if (previous === active) {
    return;
  }

  if (active) {
    pushEvent({
      message: config.activeMessage,
      readings: {
        gasPpm: state.current.gasPpm,
        lightLevelLux: state.current.lightLevelLux,
        smokePpm: state.current.smokePpm,
        temperatureC: state.current.temperatureC,
      },
      severity: config.activeSeverity,
      source: config.source,
      title: config.activeTitle,
      type: config.type,
    });
    return;
  }

  if (config.clearTitle && config.clearMessage) {
    pushEvent({
      message: config.clearMessage,
      severity: "info",
      source: config.source,
      title: config.clearTitle,
      type: `${config.type}-cleared`,
    });
  }
}

function refreshDerivedState({ suppressEvents = false } = {}) {
  const previousFlags = { ...(state.meta.flags || {}) };
  const flags = buildFlags();
  const doorOpenDurationSec = getDoorOpenDurationSec();

  Object.values(state.devices).forEach((device) => {
    const wasOnline = device.online;
    const isOnline =
      Date.now() - new Date(device.lastSeenAt || 0).getTime() <= DEVICE_TIMEOUT_MS;

    if (!suppressEvents && wasOnline !== isOnline) {
      pushEvent({
        message: isOnline
          ? `${device.label} yeniden veri gondermeye basladi.`
          : `${device.label} bir suredir veri gondermuyor.`,
        severity: isOnline ? "info" : "medium",
        source: device.source,
        title: isOnline ? "Cihaz yeniden baglandi" : "Cihaz baglantisi koptu",
        type: isOnline ? "device-online" : "device-offline",
      });
    }

    device.online = isOnline;
  });

  if (!suppressEvents) {
    transitionEvent("fall", flags.fall, {
      activeMessage: "Kamera veya model cikisi ani dusme olasiligi bildirdi.",
      activeSeverity: "critical",
      activeTitle: "Ani dusme algilandi",
      clearMessage: "Dusme alarmi normale dondu.",
      clearTitle: "Dusme alarmi temizlendi",
      source: "camera",
      type: "fall",
    });

    transitionEvent("gas", flags.gas, {
      activeMessage: "Gaz veya duman sensoru kritik seviyeye ulasti.",
      activeSeverity: "high",
      activeTitle: "Gaz / duman alarmi",
      clearMessage: "Gaz ve duman degerleri normal seviyeye indi.",
      clearTitle: "Gaz alarmi temizlendi",
      source: "esp32",
      type: "gas",
    });

    transitionEvent("temperature", flags.temperature, {
      activeMessage: "Ortam sicakligi esik degerin uzerine cikti.",
      activeSeverity: "medium",
      activeTitle: "Yuksek sicaklik tespit edildi",
      clearMessage: "Sicaklik tekrar normal araliga indi.",
      clearTitle: "Sicaklik normale dondu",
      source: "esp32",
      type: "temperature",
    });

    transitionEvent("doorOpenLong", flags.doorOpenLong, {
      activeMessage: "Kapi uzun suredir acik kaldi. Vasinin kontrol etmesi onerilir.",
      activeSeverity: "medium",
      activeTitle: "Kapi acik kaldi",
      clearMessage: "Kapi tekrar kapandi veya risk durumu gecti.",
      clearTitle: "Kapi durumu normale dondu",
      source: "esp32",
      type: "door-open",
    });

    transitionEvent("darkMotion", flags.darkMotion, {
      activeMessage: "Karanlik ortamda hareket algilandi, acil aydinlatma tetiklenebilir.",
      activeSeverity: "info",
      activeTitle: "Gece hareketi kaydedildi",
      clearMessage: "",
      clearTitle: "",
      source: "esp32",
      type: "dark-motion",
    });
  }

  state.activeAlerts = buildActiveAlerts(flags);
  state.meta.flags = flags;

  const overallStatus = state.activeAlerts.some((item) => item.severity === "critical")
    ? "critical"
    : state.activeAlerts.some((item) => item.severity === "high")
      ? "warning"
      : state.activeAlerts.some((item) => item.severity === "medium")
        ? "attention"
        : "normal";

  state.summary = {
    doorOpenDurationSec,
    emergencyLightOn: flags.darkMotion,
    lastExitAt: state.summary.lastExitAt || null,
    lastUpdateAt: state.meta.lastIngestAt || isoNow(),
    overallStatus,
    statusMessage:
      state.activeAlerts[0]?.message || "Tum sistemler normal gorunuyor.",
  };

  if (previousFlags.fall && !flags.fall) {
    state.current.fallDetected = false;
    state.current.cameraConfidence = Math.min(state.current.cameraConfidence, 0.2);
  }
}

function parseReading(readings, keys, fallback) {
  for (const key of keys) {
    if (readings[key] !== undefined) {
      return readings[key];
    }
  }
  return fallback;
}

function ingestPayload(payload) {
  const now = payload.timestamp || isoNow();
  const source = payload.source || "sensor-hub";
  const deviceId = payload.deviceId || source;
  const readings = payload.readings && typeof payload.readings === "object" ? payload.readings : payload;
  const previousDoorOpen = state.current.doorOpen;

  updateDevice(deviceId, source, now);

  if (source.includes("camera")) {
    updateDevice("camera-module", "camera", now);
  }
  if (source.includes("raspberry")) {
    updateDevice("raspberry-pi-4", "raspberry-pi", now);
  }
  if (source.includes("esp32")) {
    updateDevice("esp32-main", "esp32", now);
  }

  state.current.temperatureC = clampNumber(
    parseReading(readings, ["temperatureC", "temperature"], state.current.temperatureC),
    state.current.temperatureC,
  );
  state.current.humidity = clampNumber(
    parseReading(readings, ["humidity", "humidityPct"], state.current.humidity),
    state.current.humidity,
  );
  state.current.gasPpm = clampNumber(
    parseReading(readings, ["gasPpm", "gasLevel", "mq2"], state.current.gasPpm),
    state.current.gasPpm,
  );
  state.current.heartRateBpm = clampNumber(
    parseReading(readings, ["heartRateBpm", "heartRate", "pulse"], state.current.heartRateBpm),
    state.current.heartRateBpm,
  );
  state.current.smokePpm = clampNumber(
    parseReading(readings, ["smokePpm", "smokeLevel", "mq5"], state.current.smokePpm),
    state.current.smokePpm,
  );
  state.current.spo2 = clampNumber(
    parseReading(readings, ["spo2", "bloodOxygen", "oxygenSaturation"], state.current.spo2),
    state.current.spo2,
  );
  state.current.stepCount = clampNumber(
    parseReading(readings, ["stepCount", "steps", "adim"], state.current.stepCount),
    state.current.stepCount,
  );
  state.current.stepGoal = clampNumber(
    parseReading(readings, ["stepGoal", "dailyStepGoal"], state.current.stepGoal),
    state.current.stepGoal,
  );
  state.current.braceletBatteryPct = clampNumber(
    parseReading(
      readings,
      ["braceletBatteryPct", "batteryPct", "wearableBattery"],
      state.current.braceletBatteryPct,
    ),
    state.current.braceletBatteryPct,
  );
  state.current.motionDetected = asBoolean(
    parseReading(readings, ["motionDetected", "motion"], state.current.motionDetected),
    state.current.motionDetected,
  );
  state.current.doorOpen = asBoolean(
    parseReading(readings, ["doorOpen", "door"], state.current.doorOpen),
    state.current.doorOpen,
  );
  state.current.lightLevelLux = clampNumber(
    parseReading(readings, ["lightLevelLux", "lux", "ldrLux"], state.current.lightLevelLux),
    state.current.lightLevelLux,
  );
  state.current.lightOn = asBoolean(
    parseReading(readings, ["lightOn", "roomLightOn", "lampOn"], state.current.lightLevelLux > settings.thresholds.darkLux),
    state.current.lightLevelLux > settings.thresholds.darkLux,
  );
  state.current.fallDetected = asBoolean(
    parseReading(readings, ["fallDetected", "fall"], state.current.fallDetected),
    state.current.fallDetected,
  );
  state.current.cameraConfidence = clampNumber(
    parseReading(readings, ["cameraConfidence", "fallConfidence"], state.current.cameraConfidence),
    state.current.cameraConfidence,
  );
  state.current.stoveOn = asBoolean(
    parseReading(readings, ["stoveOn", "gasValveOpen"], state.current.stoveOn),
    state.current.stoveOn,
  );

  const personExitedNow = asBoolean(
    parseReading(readings, ["personExited", "exitDetected"], false),
    false,
  );

  if (!previousDoorOpen && state.current.doorOpen) {
    state.current.doorOpenedAt = now;
    pushEvent({
      message: "Kapi acildi. Giris veya cikis hareketi kaydediliyor.",
      severity: "info",
      source,
      title: "Kapi acildi",
      type: "door-opened",
    });
  }

  if (previousDoorOpen && !state.current.doorOpen) {
    pushEvent({
      message: "Kapi tekrar kapandi, acik kalma suresi sifirlandi.",
      severity: "info",
      source,
      title: "Kapi kapandi",
      type: "door-closed",
    });
    state.current.doorOpenedAt = null;
  }

  if (!state.current.doorOpen) {
    state.current.doorOpenedAt = null;
  }

  if (personExitedNow) {
    state.summary.lastExitAt = now;
    pushEvent({
      message: "Evden cikis senaryosu kaydedildi. Vasi bilgilendirilmelidir.",
      severity: "medium",
      source,
      title: "Evden cikis algilandi",
      type: "exit-detected",
    });
  }

  state.current.personExited = personExitedNow;
  state.meta.lastIngestAt = now;
  state.meta.lastScenario = payload.scenario || source;

  refreshDerivedState();
  persistAll();
  broadcastSnapshot();

  return state;
}

function simulateScenario(name) {
  const scenario = String(name || "normal").toLowerCase();
  const now = isoNow();
  const basePayload = {
    deviceId: "esp32-main",
    readings: {
      cameraConfidence: 0.06,
      doorOpen: false,
      fallDetected: false,
      gasPpm: 110,
      humidity: 46,
      lightLevelLux: 210,
      motionDetected: false,
      personExited: false,
      smokePpm: 8,
      stoveOn: false,
      temperatureC: 24.2,
    },
    scenario,
    source: "simulator",
    timestamp: now,
  };

  if (scenario === "gas") {
    basePayload.readings.gasPpm = 560;
    basePayload.readings.smokePpm = 170;
    basePayload.readings.stoveOn = true;
  } else if (scenario === "fall") {
    basePayload.deviceId = "camera-module";
    basePayload.source = "camera";
    basePayload.readings.cameraConfidence = 0.96;
    basePayload.readings.fallDetected = true;
    basePayload.readings.motionDetected = true;
  } else if (scenario === "door") {
    basePayload.readings.doorOpen = true;
    basePayload.readings.personExited = true;
  } else if (scenario === "night-motion") {
    basePayload.readings.lightLevelLux = 18;
    basePayload.readings.motionDetected = true;
  } else if (scenario === "temperature") {
    basePayload.readings.temperatureC = 34.7;
  }

  return ingestPayload(basePayload);
}

function buildSnapshot(limit = 25) {
  return {
    events: events.slice(0, limit),
    settings,
    state,
    type: "snapshot",
  };
}

function writeCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
}

function sendJson(res, statusCode, payload) {
  writeCorsHeaders(res);
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(`${JSON.stringify(payload)}\n`);
}

function sendText(res, statusCode, payload) {
  writeCorsHeaders(res);
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end(payload);
}

function broadcastSnapshot() {
  const payload = `data: ${JSON.stringify(buildSnapshot(20))}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 2_000_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function mergeSettings(payload) {
  if (payload.notifications && typeof payload.notifications === "object") {
    settings.notifications = {
      ...settings.notifications,
      ...Object.fromEntries(
        Object.entries(payload.notifications).map(([key, value]) => [key, asBoolean(value)]),
      ),
    };
  }

  if (payload.thresholds && typeof payload.thresholds === "object") {
    settings.thresholds = {
      ...settings.thresholds,
      ...Object.fromEntries(
        Object.entries(payload.thresholds).map(([key, value]) => [key, clampNumber(value, settings.thresholds[key])]),
      ),
    };
  }

  if (payload.caretaker && typeof payload.caretaker === "object") {
    settings.caretaker = {
      ...settings.caretaker,
      ...Object.fromEntries(
        Object.entries(payload.caretaker).map(([key, value]) => [key, String(value)]),
      ),
    };
  }

  refreshDerivedState({ suppressEvents: true });
  persistAll();
  broadcastSnapshot();
}

function sanitizePathname(pathname) {
  const decoded = decodeURIComponent(pathname);
  const requested = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.normalize(path.join(ROOT_DIR, requested));
  if (!resolved.startsWith(ROOT_DIR)) {
    return null;
  }
  return resolved;
}

function serveStatic(req, res, pathname) {
  const resolvedPath = sanitizePathname(pathname);
  if (!resolvedPath) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.stat(resolvedPath, (error, stat) => {
    if (error || !stat.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    writeCorsHeaders(res);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
    });
    fs.createReadStream(resolvedPath).pipe(res);
  });
}

function handleStream(req, res) {
  writeCorsHeaders(res);
  res.writeHead(200, {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
  });

  res.write(`data: ${JSON.stringify(buildSnapshot(20))}\n\n`);
  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    writeCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      devices: Object.keys(state.devices).length,
      events: events.length,
      resetDelivery: getResetProviderStatus(),
      serverTime: isoNow(),
      status: "ok",
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, state);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/settings") {
    sendJson(res, 200, settings);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    const limit = clampNumber(url.searchParams.get("limit"), 20);
    sendJson(res, 200, events.slice(0, Math.max(1, Math.min(limit, 100))));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    sendJson(res, 200, buildSnapshot(20));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/stream") {
    handleStream(req, res);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    try {
      const body = await parseBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "").trim();

      if (!username || !password) {
        sendJson(res, 400, {
          message: "Kullanici adi ve sifre bos birakilamaz.",
        });
        return true;
      }

      const user = findUser(username);
      if (!user || user.passwordHash !== hashPassword(password)) {
        sendJson(res, 401, {
          message: "Kullanici adi veya sifre hatali.",
        });
        return true;
      }

      sendJson(res, 200, {
        token: makeId("token"),
        user: sanitizeUser(user),
      });
      return true;
    } catch (error) {
      sendJson(res, 400, { message: error.message });
      return true;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    try {
      const body = await parseBody(req);
      const displayName = String(body.displayName || "").trim();
      const email = String(body.email || "").trim();
      const username = String(body.username || "").trim();
      const password = String(body.password || "").trim();
      const passwordConfirm = String(body.passwordConfirm || "").trim();
      const relation = String(body.relation || "Aile Yakini").trim();
      const phone = String(body.phone || "").trim();

      if (!displayName || !username || !password || !passwordConfirm) {
        sendJson(res, 400, {
          message: "Ad soyad, kullanici adi ve sifre alanlari zorunludur.",
        });
        return true;
      }

      if (username.length < 3) {
        sendJson(res, 400, {
          message: "Kullanici adi en az 3 karakter olmali.",
        });
        return true;
      }

      if (password.length < 4) {
        sendJson(res, 400, {
          message: "Sifre en az 4 karakter olmali.",
        });
        return true;
      }

      if (!phone && !email) {
        sendJson(res, 400, {
          message: "Telefon veya e-posta alanlarindan en az biri zorunludur.",
        });
        return true;
      }

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(res, 400, {
          message: "Gecerli bir e-posta adresi gir.",
        });
        return true;
      }

      if (password !== passwordConfirm) {
        sendJson(res, 400, {
          message: "Sifre tekrar alani eslesmiyor.",
        });
        return true;
      }

      if (findUser(username)) {
        sendJson(res, 409, {
          message: "Bu kullanici adi zaten kullaniliyor.",
        });
        return true;
      }

      if (email && findUserByEmail(email)) {
        sendJson(res, 409, {
          message: "Bu e-posta adresi zaten kullaniliyor.",
        });
        return true;
      }

      const user = {
        createdAt: isoNow(),
        displayName,
        email,
        passwordHash: hashPassword(password),
        phone,
        relation: relation || "Aile Yakini",
        role: "caretaker",
        username,
      };

      users.push(user);
      persistAll();

      pushEvent({
        message: `${displayName} adli yeni vasi hesabi olusturuldu.`,
        severity: "info",
        source: "auth",
        title: "Yeni kullanici kaydi",
        type: "user-registered",
      });
      persistAll();
      broadcastSnapshot();

      sendJson(res, 201, {
        message: "Kayit basarili.",
        token: makeId("token"),
        user: sanitizeUser(user),
      });
      return true;
    } catch (error) {
      sendJson(res, 400, { message: error.message });
      return true;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/auth/request-reset-code") {
    try {
      const body = await parseBody(req);
      const username = String(body.username || "").trim();
      const channel = body.channel === "email" ? "email" : "sms";
      const phone = String(body.phone || "").trim();
      const email = String(body.email || "").trim();

      if (!username) {
        sendJson(res, 400, {
          message: "Kullanici adi zorunludur.",
        });
        return true;
      }

      const user = findUser(username);
      if (!user) {
        sendJson(res, 404, {
          message: "Bu kullanici adi icin hesap bulunamadi.",
        });
        return true;
      }

      const existingRequest = findResetRequest(username);
      if (existingRequest) {
        const retryAfterMs =
          new Date(existingRequest.createdAt).getTime() + RESET_REQUEST_COOLDOWN_MS - Date.now();
        if (retryAfterMs > 0) {
          const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
          sendJson(res, 429, {
            message: `Yeni kod istemek icin ${retryAfterSec} saniye bekle.`,
            retryAfterSec,
          });
          return true;
        }
      }

      let deliveryHint = "";
      let channelLabel = "";

      if (channel === "sms") {
        if (!user.phone) {
          sendJson(res, 400, {
            message: "Bu hesapta kayitli telefon bilgisi bulunmuyor.",
          });
          return true;
        }

        if (!phone) {
          sendJson(res, 400, {
            message: "SMS dogrulamasi icin kayitli telefonu gir.",
          });
          return true;
        }

        if (normalizePhone(user.phone) !== normalizePhone(phone)) {
          sendJson(res, 403, {
            message: "Telefon bilgisi eslesmedi.",
          });
          return true;
        }

        deliveryHint = maskPhone(user.phone);
        channelLabel = "SMS";
      } else {
        if (!user.email) {
          sendJson(res, 400, {
            message: "Bu hesapta kayitli e-posta adresi bulunmuyor.",
          });
          return true;
        }

        if (!email) {
          sendJson(res, 400, {
            message: "E-posta dogrulamasi icin kayitli e-posta adresini gir.",
          });
          return true;
        }

        if (normalizeEmail(user.email) !== normalizeEmail(email)) {
          sendJson(res, 403, {
            message: "E-posta adresi eslesmedi.",
          });
          return true;
        }

        deliveryHint = maskEmail(user.email);
        channelLabel = "e-posta";
      }

      const code = generateResetCode();
      const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS).toISOString();
      const cooldownUntil = new Date(Date.now() + RESET_REQUEST_COOLDOWN_MS).toISOString();

      upsertResetRequest({
        attemptsLeft: RESET_CODE_MAX_ATTEMPTS,
        channel,
        codeHash: hashPassword(code),
        createdAt: isoNow(),
        deliveryHint,
        expiresAt,
        username: user.username,
      });
      persistAll();

      let delivery;
      try {
        delivery = await deliverResetCode({
          channel,
          code,
          deliveryHint,
          expiresAt,
          user,
        });
      } catch (error) {
        resetRequests = resetRequests.filter(
          (request) => normalizeText(request.username) !== normalizeText(user.username),
        );
        persistAll();
        sendJson(res, 503, {
          message: error.message,
        });
        return true;
      }

      pushEvent({
        message:
          delivery.deliveryMode === "live"
            ? `${user.displayName} icin ${channelLabel} dogrulama kodu gonderildi.`
            : `${user.displayName} icin ${channelLabel} dogrulama kodu test modunda olusturuldu.`,
        severity: "info",
        source: "auth",
        title: "Dogrulama kodu gonderildi",
        type: "password-reset-requested",
      });
      persistAll();
      broadcastSnapshot();

      const payload = {
        cooldownUntil,
        deliveryHint,
        deliveryMode: delivery.deliveryMode,
        expiresAt,
        message:
          delivery.deliveryMode === "live"
            ? `Dogrulama kodu ${channelLabel} kanalina gonderildi.`
            : `Dogrulama kodu ${channelLabel} icin test modunda hazirlandi.`,
      };

      if (delivery.previewCode) {
        payload.demoCode = delivery.previewCode;
      }

      sendJson(res, 200, payload);
      return true;
    } catch (error) {
      sendJson(res, 400, { message: error.message });
      return true;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
    try {
      const body = await parseBody(req);
      const username = String(body.username || "").trim();
      const code = String(body.code || "").trim();
      const newPassword = String(body.newPassword || "").trim();
      const passwordConfirm = String(body.passwordConfirm || "").trim();

      if (!username || !code || !newPassword || !passwordConfirm) {
        sendJson(res, 400, {
          message: "Kullanici adi, kod ve yeni sifre alanlari zorunludur.",
        });
        return true;
      }

      if (newPassword.length < 4) {
        sendJson(res, 400, {
          message: "Sifre en az 4 karakter olmali.",
        });
        return true;
      }

      if (newPassword !== passwordConfirm) {
        sendJson(res, 400, {
          message: "Sifre tekrar alani eslesmiyor.",
        });
        return true;
      }

      const user = findUser(username);
      if (!user) {
        sendJson(res, 404, {
          message: "Bu kullanici adi icin hesap bulunamadi.",
        });
        return true;
      }

      const resetRequest = findResetRequest(username);
      if (!resetRequest) {
        sendJson(res, 410, {
          message: "Aktif dogrulama kodu bulunamadi. Once yeni kod iste.",
        });
        return true;
      }

      if (hashPassword(code) !== resetRequest.codeHash) {
        resetRequest.attemptsLeft -= 1;
        persistAll();
        sendJson(res, 401, {
          message:
            resetRequest.attemptsLeft > 0
              ? `Dogrulama kodu hatali. Kalan deneme: ${resetRequest.attemptsLeft}`
              : "Dogrulama kodu gecersiz. Yeni kod iste.",
        });
        return true;
      }

      user.passwordHash = hashPassword(newPassword);
      resetRequests = resetRequests.filter(
        (request) => normalizeText(request.username) !== normalizeText(username),
      );
      persistAll();

      pushEvent({
        message: `${user.displayName} icin sifre sifirlama islemi tamamlandi.`,
        severity: "info",
        source: "auth",
        title: "Sifre guncellendi",
        type: "password-reset",
      });
      persistAll();
      broadcastSnapshot();

      sendJson(res, 200, {
        message: "Sifre guncellendi. Yeni sifrenle giris yapabilirsin.",
      });
      return true;
    } catch (error) {
      sendJson(res, 400, { message: error.message });
      return true;
    }
  }

  if (req.method === "PUT" && url.pathname === "/api/settings") {
    try {
      const body = await parseBody(req);
      mergeSettings(body);
      sendJson(res, 200, settings);
      return true;
    } catch (error) {
      sendJson(res, 400, { message: error.message });
      return true;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/sensors/ingest") {
    try {
      const body = await parseBody(req);
      const nextState = ingestPayload(body);
      sendJson(res, 200, {
        activeAlerts: nextState.activeAlerts,
        message: "Veri kaydedildi.",
        summary: nextState.summary,
      });
      return true;
    } catch (error) {
      sendJson(res, 400, { message: error.message });
      return true;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/simulate/scenario") {
    try {
      const body = await parseBody(req);
      const scenario = body.scenario || "normal";
      const nextState = simulateScenario(scenario);
      sendJson(res, 200, {
        message: `${scenario} senaryosu uygulandi.`,
        state: nextState,
      });
      return true;
    } catch (error) {
      sendJson(res, 400, { message: error.message });
      return true;
    }
  }

  return false;
}

refreshDerivedState({ suppressEvents: true });
persistAll();

setInterval(() => {
  refreshDerivedState();
  persistAll();
  broadcastSnapshot();
}, 5_000);

setInterval(() => {
  for (const client of sseClients) {
    client.write(": heartbeat\n\n");
  }
}, 20_000);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, url);
      if (!handled) {
        sendText(res, 404, "API route not found");
      }
      return;
    }

    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, {
      message: "Sunucu beklenmeyen bir hata ile karsilasti.",
      detail: error.message,
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`BYTS backend hazir: http://${HOST}:${PORT}`);
  console.log(
    `Reset servisleri -> demo:${getResetProviderStatus().demoCodesEnabled ? "acik" : "kapali"} | email:${
      getResetProviderStatus().emailConfigured ? "hazir" : "eksik"
    } | sms:${getResetProviderStatus().smsConfigured ? "hazir" : "eksik"}`,
  );
});
