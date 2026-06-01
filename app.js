const API_BASE = window.location.protocol === "file:" ? "http://localhost:8080" : "";

const appState = {
  events: [],
  forgotCountdownTimer: null,
  forgotRequest: null,
  settings: null,
  snapshot: null,
  stream: null,
  token: window.localStorage.getItem("bytsToken") || "",
  user: null,
};

const refs = {
  activeAlert: document.querySelector(".alert"),
  activeAlertBody: document.querySelector(".alert span"),
  activeAlertTitle: document.querySelector(".alert strong"),
  auth: document.getElementById("auth"),
  bottomNav: document.getElementById("bottomNav"),
  createAccountBtn: document.getElementById("createAccountBtn"),
  footerChip: document.querySelector(".side-footer .chip"),
  forgotCancelBtn: document.getElementById("forgotCancelBtn"),
  forgotChannel: document.getElementById("forgotChannel"),
  forgotCode: document.getElementById("forgotCode"),
  forgotEmail: document.getElementById("forgotEmail"),
  forgotEmailField: document.getElementById("forgotEmailField"),
  forgotLink: document.getElementById("forgotLink"),
  forgotMessage: document.getElementById("forgotMessage"),
  forgotMeta: document.getElementById("forgotMeta"),
  forgotPanel: document.getElementById("forgotPanel"),
  forgotPassword: document.getElementById("forgotPassword"),
  forgotPasswordConfirm: document.getElementById("forgotPasswordConfirm"),
  forgotPhone: document.getElementById("forgotPhone"),
  forgotPhoneField: document.getElementById("forgotPhoneField"),
  forgotRequestBtn: document.getElementById("forgotRequestBtn"),
  forgotResendBtn: document.getElementById("forgotResendBtn"),
  forgotStepConfirm: document.getElementById("forgotStepConfirm"),
  forgotStepRequest: document.getElementById("forgotStepRequest"),
  forgotSubmitBtn: document.getElementById("forgotSubmitBtn"),
  forgotSummary: document.getElementById("forgotSummary"),
  forgotUsername: document.getElementById("forgotUsername"),
  headerChip: document.querySelector(".main-header .chip"),
  historyList: document.querySelector("#page-history .list"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  pageSettings: document.getElementById("page-settings"),
  pageSubtitle: document.getElementById("pageSubtitle"),
  pageTitle: document.getElementById("pageTitle"),
  password: document.getElementById("password"),
  registerCancelBtn: document.getElementById("registerCancelBtn"),
  registerDisplayName: document.getElementById("registerDisplayName"),
  registerEmail: document.getElementById("registerEmail"),
  registerMessage: document.getElementById("registerMessage"),
  registerPanel: document.getElementById("registerPanel"),
  registerPassword: document.getElementById("registerPassword"),
  registerPasswordConfirm: document.getElementById("registerPasswordConfirm"),
  registerPhone: document.getElementById("registerPhone"),
  registerRelation: document.getElementById("registerRelation"),
  registerSubmitBtn: document.getElementById("registerSubmitBtn"),
  registerUsername: document.getElementById("registerUsername"),
  shell: document.getElementById("shell"),
  splash: document.getElementById("splash"),
  username: document.getElementById("username"),
};

const pages = {
  dashboard: document.getElementById("page-dashboard"),
  history: document.getElementById("page-history"),
  settings: document.getElementById("page-settings"),
};

const pageMeta = {
  dashboard: {
    subtitle: "Sensorlerden gelen anlik veriler ve sistem durumu.",
    title: "Izleme Paneli",
  },
  history: {
    subtitle: "Sistem tarafindan kaydedilen son olaylar.",
    title: "Uyari ve Olay Gecmisi",
  },
  settings: {
    subtitle: "Bildirim, esik deger ve cihaz durumlarini yonetin.",
    title: "Bildirim Ayarlari",
  },
};

const sensorRefs = {
  steps: pickSensor("[aria-label='Adim Bilgisi']"),
  heart: pickSensor("[aria-label='Kalp Atisi']"),
  system: pickSensor("[aria-label='Sistem Durumu']"),
  stability: pickSensor("[aria-label='Durum Ozeti']"),
  door: pickSensor("[aria-label='Kapi Durumu']"),
  temperature: pickSensor("[aria-label='Oda Sicakligi']"),
  light: pickSensor("[aria-label='Isik Durumu']"),
};

function pickSensor(selector) {
  const card = document.querySelector(selector);
  return {
    card,
    label: card?.querySelector(".label"),
    value: card?.querySelector(".value"),
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value, digits = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "--";
  }
  return parsed.toFixed(digits);
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatTime(value) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function showPage(page) {
  Object.entries(pages).forEach(([key, element]) => {
    element.classList.toggle("active", key === page);
  });
  refs.pageTitle.textContent = pageMeta[page].title;
  refs.pageSubtitle.textContent = pageMeta[page].subtitle;
  document.querySelectorAll("[data-page]").forEach((button) => {
    const isCurrent = button.getAttribute("data-page") === page;
    button.setAttribute("aria-current", isCurrent ? "page" : "false");
  });
}

function setRegisterMessage(message, isError = false) {
  refs.registerMessage.textContent = message || "";
  refs.registerMessage.style.color = isError ? "#b61f1f" : "#0c6a59";
}

function openRegisterPanel() {
  closeForgotPanel();
  refs.registerPanel.classList.remove("hidden");
  setRegisterMessage("");
  refs.registerDisplayName.focus();
}

function closeRegisterPanel() {
  refs.registerPanel.classList.add("hidden");
  setRegisterMessage("");
}

function clearRegisterForm() {
  refs.registerDisplayName.value = "";
  refs.registerEmail.value = "";
  refs.registerRelation.value = "";
  refs.registerPhone.value = "";
  refs.registerUsername.value = "";
  refs.registerPassword.value = "";
  refs.registerPasswordConfirm.value = "";
}

function setForgotMessage(message, isError = false) {
  refs.forgotMessage.textContent = message || "";
  refs.forgotMessage.style.color = isError ? "#b61f1f" : "#0c6a59";
}

function clearForgotCountdown() {
  if (!appState.forgotCountdownTimer) {
    return;
  }
  window.clearInterval(appState.forgotCountdownTimer);
  appState.forgotCountdownTimer = null;
}

function formatRemainingTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds} sn`;
  }
  return `${minutes} dk ${String(seconds).padStart(2, "0")} sn`;
}

function renderForgotMeta() {
  if (!refs.forgotMeta || !refs.forgotResendBtn) {
    return;
  }

  if (!appState.forgotRequest) {
    refs.forgotMeta.textContent = "";
    refs.forgotResendBtn.disabled = true;
    return;
  }

  const now = Date.now();
  const expiresAtMs = new Date(appState.forgotRequest.expiresAt || 0).getTime();
  const cooldownUntilMs = new Date(appState.forgotRequest.cooldownUntil || 0).getTime();
  const parts = [];

  if (Number.isFinite(expiresAtMs) && expiresAtMs > now) {
    parts.push(`Kod ${formatRemainingTime(expiresAtMs - now)} boyunca gecerli.`);
  } else {
    parts.push("Kodun suresi doldu. Yeniden kod iste.");
  }

  if (Number.isFinite(cooldownUntilMs) && cooldownUntilMs > now) {
    parts.push(`Yeniden gonderme icin ${formatRemainingTime(cooldownUntilMs - now)} bekle.`);
    refs.forgotResendBtn.disabled = true;
  } else {
    parts.push("Yeniden gonderme hazir.");
    refs.forgotResendBtn.disabled = false;
  }

  refs.forgotMeta.textContent = parts.join(" ");
}

function startForgotCountdown() {
  clearForgotCountdown();
  renderForgotMeta();

  if (!appState.forgotRequest) {
    return;
  }

  appState.forgotCountdownTimer = window.setInterval(() => {
    renderForgotMeta();
    const expiresAtMs = new Date(appState.forgotRequest?.expiresAt || 0).getTime();
    const cooldownUntilMs = new Date(appState.forgotRequest?.cooldownUntil || 0).getTime();
    if (Date.now() > Math.max(expiresAtMs, cooldownUntilMs, 0)) {
      clearForgotCountdown();
      renderForgotMeta();
    }
  }, 1000);
}

function openForgotPanel() {
  closeRegisterPanel();
  clearForgotCountdown();
  appState.forgotRequest = null;
  refs.forgotPanel.classList.remove("hidden");
  setForgotMessage("");
  refs.forgotMeta.textContent = "";
  refs.forgotSummary.textContent = "";
  clearForgotForm();
  setForgotStep("request");
  refs.forgotUsername.focus();
}

function closeForgotPanel() {
  refs.forgotPanel.classList.add("hidden");
  clearForgotCountdown();
  appState.forgotRequest = null;
  setForgotMessage("");
  refs.forgotMeta.textContent = "";
  refs.forgotSummary.textContent = "";
  clearForgotForm();
  setForgotStep("request");
}

function clearForgotForm() {
  refs.forgotChannel.value = "sms";
  refs.forgotCode.value = "";
  refs.forgotEmail.value = "";
  refs.forgotUsername.value = "";
  refs.forgotPhone.value = "";
  refs.forgotPassword.value = "";
  refs.forgotPasswordConfirm.value = "";
  updateForgotChannelFields();
}

function setForgotStep(step) {
  const showConfirm = step === "confirm";
  refs.forgotStepRequest.classList.toggle("hidden", showConfirm);
  refs.forgotStepConfirm.classList.toggle("hidden", !showConfirm);
  refs.forgotRequestBtn.classList.toggle("hidden", showConfirm);
  refs.forgotResendBtn.classList.toggle("hidden", !showConfirm);
  refs.forgotSubmitBtn.classList.toggle("hidden", !showConfirm);
}

function updateForgotChannelFields() {
  const channel = refs.forgotChannel.value;
  refs.forgotPhoneField.classList.toggle("hidden", channel !== "sms");
  refs.forgotEmailField.classList.toggle("hidden", channel !== "email");
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const body = await response.text();
    let message = body || `Request failed with ${response.status}`;

    try {
      const parsed = JSON.parse(body);
      if (parsed?.message) {
        message = parsed.message;
      }
    } catch (error) {
      // Text body oldugu durumlarda ham mesaji kullan.
    }

    throw new Error(message);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function renderAlert() {
  const alert = appState.snapshot?.activeAlerts?.[0];
  if (!alert) {
    refs.activeAlert.classList.add("hidden");
    return;
  }

  refs.activeAlert.classList.remove("hidden");
  refs.activeAlertTitle.textContent = `${severityLabel(alert.severity)}:`;
  refs.activeAlertBody.textContent = alert.message;
}

function severityLabel(severity) {
  if (severity === "critical") {
    return "KRITIK UYARI";
  }
  if (severity === "high") {
    return "ONEMLI UYARI";
  }
  if (severity === "medium") {
    return "DIKKAT";
  }
  return "BILGI";
}

function overallStatusText(status) {
  if (status === "critical") {
    return "Kritik Alarm";
  }
  if (status === "warning") {
    return "Risk Var";
  }
  if (status === "attention") {
    return "Kontrol Et";
  }
  return "Sistem Aktif";
}

function connectivityText() {
  const devices = Object.values(appState.snapshot?.devices || {});
  if (devices.length === 0) {
    return "Baglanti Bekleniyor";
  }
  const onlineCount = devices.filter((device) => device.online).length;
  return `${onlineCount}/${devices.length} cihaz aktif`;
}

function heartRateLabel(bpm) {
  if (!Number.isFinite(bpm)) {
    return "--";
  }
  if (bpm >= 100) {
    return "Yuksek";
  }
  if (bpm <= 55) {
    return "Dusuk";
  }
  return "Normal";
}

function stabilityValue(status) {
  if (status === "critical") {
    return "KRITIK";
  }
  if (status === "warning") {
    return "RISK";
  }
  if (status === "attention") {
    return "DIKKAT";
  }
  return "NORMAL";
}

function setSensorValue(ref, value, label) {
  if (!ref?.value || !ref?.label) {
    return;
  }
  ref.value.textContent = value;
  ref.label.textContent = label;
}

function renderDashboard() {
  const snapshot = appState.snapshot;
  if (!snapshot) {
    return;
  }

  const current = snapshot.current;
  const summary = snapshot.summary;
  const onlineDevices = Object.values(snapshot.devices || {}).filter((device) => device.online).length;
  const stepCount = Number(current.stepCount || 0);
  const stepGoal = Math.max(1, Number(current.stepGoal || 5000));
  const lightIsOn =
    typeof current.lightOn === "boolean"
      ? current.lightOn
      : Number(current.lightLevelLux || 0) > Number(appState.settings?.thresholds?.darkLux || 80);

  setSensorValue(
    sensorRefs.steps,
    `${formatNumber(stepCount, 0)} adim`,
    stepCount >= stepGoal ? "Hedefe ulasildi" : `${formatNumber(stepGoal - stepCount, 0)} adim kaldi`,
  );

  setSensorValue(
    sensorRefs.heart,
    `${formatNumber(current.heartRateBpm, 0)} BPM`,
    heartRateLabel(Number(current.heartRateBpm)),
  );

  setSensorValue(
    sensorRefs.system,
    onlineDevices > 0 ? "AKTIF" : "BEKLIYOR",
    onlineDevices > 0 ? "Sistem Aktif" : "Baglanti Bekleniyor",
  );

  setSensorValue(
    sensorRefs.stability,
    stabilityValue(summary.overallStatus),
    summary.overallStatus === "normal" ? "Sistem Stabil" : overallStatusText(summary.overallStatus),
  );

  setSensorValue(
    sensorRefs.door,
    current.doorOpen ? "ACIK" : "KAPALI",
    "Kapi Durumu",
  );

  setSensorValue(
    sensorRefs.temperature,
    `${formatNumber(current.temperatureC, 0)}°C`,
    "Oda Sicakligi",
  );

  setSensorValue(
    sensorRefs.light,
    lightIsOn ? "ACIK" : "KAPALI",
    "Isik Durumu",
  );

  refs.headerChip.textContent = overallStatusText(summary.overallStatus);
  refs.footerChip.textContent = `${connectivityText()} | Son veri ${formatTime(summary.lastUpdateAt)}`;

  pageMeta.dashboard.subtitle = `Son guncelleme ${formatDateTime(
    summary.lastUpdateAt,
  )} | Kamera guveni ${formatNumber(current.cameraConfidence, 2)}`;
  if (document.querySelector("[data-page][aria-current='page']")?.getAttribute("data-page") === "dashboard") {
    refs.pageSubtitle.textContent = pageMeta.dashboard.subtitle;
  }

  renderAlert();
}

function iconForEvent(type) {
  if (type.includes("fall")) {
    return `
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="15" cy="5" r="2" fill="#ff2e2e" />
        <path d="M13 21l1-6-2-2-3 3-2-1 4-7 3 1 2 3 2 1" stroke="#ff2e2e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;
  }
  if (type.includes("gas")) {
    return `
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 2c3 4 1 6 0 7-1 1-2 2-2 4a4 4 0 0 0 8 0c0-4-4-6-6-11Z" fill="#ff2e2e" />
      </svg>
    `;
  }
  if (type.includes("door") || type.includes("exit")) {
    return `
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M7 3h10v18H7V3Z" stroke="#ff2e2e" stroke-width="2" stroke-linejoin="round" />
        <path d="M13.5 12h.01" stroke="#ff2e2e" stroke-width="3" stroke-linecap="round" />
      </svg>
    `;
  }
  if (type.includes("temperature")) {
    return `
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M10 14.8V5a2 2 0 0 1 4 0v9.8a3.5 3.5 0 1 1-4 0Z" stroke="#ff2e2e" stroke-width="2" stroke-linejoin="round" />
        <path d="M12 11v6" stroke="#ff2e2e" stroke-width="2" stroke-linecap="round" />
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 3a6 6 0 0 0-3 11v3h6v-3a6 6 0 0 0-3-11Z" stroke="#ff2e2e" stroke-width="2" stroke-linejoin="round" />
      <path d="M9 21h6" stroke="#ff2e2e" stroke-width="2" stroke-linecap="round" />
    </svg>
  `;
}

function renderHistory() {
  refs.historyList.innerHTML = appState.events
    .map(
      (event) => `
        <article class="event">
          <div class="icon" aria-hidden="true">${iconForEvent(event.type)}</div>
          <div>
            <strong>${escapeHtml(event.title)}</strong>
            <span>${escapeHtml(event.message)}</span>
          </div>
          <time datetime="${escapeHtml(event.timestamp)}">${formatTime(event.timestamp)}</time>
        </article>
      `,
    )
    .join("");
}

function renderSettings() {
  const settings = appState.settings;
  const devices = Object.values(appState.snapshot?.devices || {});
  if (!settings) {
    return;
  }

  const notificationRows = [
    ["fall", "Ani Dusme Bildirimi", "Kritik dusme senaryosunda uyari gonder."],
    ["gas", "Gaz / Duman Bildirimi", "Gaz, duman veya ocak riski oldugunda haber ver."],
    ["door", "Kapi ve Cikis Bildirimi", "Kapi acik kalma veya evden cikis durumlarini izle."],
    ["motion", "Gece Hareket Bildirimi", "Karanlikta hareket algilandiginda kayit olustur."],
    ["temperature", "Sicaklik Bildirimi", "Yuksek sicaklik durumlarinda uyari ver."],
  ];

  refs.pageSettings.innerHTML = `
    ${notificationRows
      .map(
        ([key, title, subtitle]) => `
          <div class="setting">
            <div>
              <strong>${title}</strong>
              <span>${subtitle}</span>
            </div>
            <button class="toggle" type="button" data-setting-key="${key}" aria-checked="${
              settings.notifications[key] ? "true" : "false"
            }" aria-label="${title}"></button>
          </div>
        `,
      )
      .join("")}
    <div class="setting">
      <div>
        <strong>Esik Ozeti</strong>
        <span>Sicaklik ${formatNumber(settings.thresholds.temperatureHighC, 0)}°C | Gaz ${formatNumber(
          settings.thresholds.gasHighPpm,
          0,
        )} ppm | Kapi ${formatNumber(settings.thresholds.doorOpenTooLongSec, 0)} sn</span>
      </div>
      <span>${escapeHtml(settings.caretaker.name)}</span>
    </div>
    ${devices
      .map(
        (device) => `
          <div class="setting">
            <div>
              <strong>${escapeHtml(device.label)}</strong>
              <span>Son veri ${formatDateTime(device.lastSeenAt)}</span>
            </div>
            <span>${device.online ? "AKTIF" : "KOPUK"}</span>
          </div>
        `,
      )
      .join("")}
  `;

  refs.pageSettings.querySelectorAll("[data-setting-key]").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.getAttribute("data-setting-key");
      const currentValue = button.getAttribute("aria-checked") === "true";

      try {
        const updated = await api("/api/settings", {
          body: JSON.stringify({
            notifications: {
              [key]: !currentValue,
            },
          }),
          method: "PUT",
        });

        appState.settings = updated;
        renderSettings();
      } catch (error) {
        window.alert(`Ayar kaydedilemedi: ${error.message}`);
      }
    });
  });
}

function renderAll() {
  renderDashboard();
  renderHistory();
  renderSettings();
}

async function loadDashboard() {
  const [snapshot, settings, events] = await Promise.all([
    api("/api/state"),
    api("/api/settings"),
    api("/api/events?limit=12"),
  ]);

  appState.snapshot = snapshot;
  appState.settings = settings;
  appState.events = events;
  renderAll();
  connectStream();
}

function connectStream() {
  if (appState.stream) {
    appState.stream.close();
  }

  const stream = new EventSource(`${API_BASE}/api/stream`);
  appState.stream = stream;

  stream.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    appState.snapshot = payload.state;
    appState.settings = payload.settings;
    appState.events = payload.events;
    renderAll();
  };

  stream.onerror = () => {
    refs.footerChip.textContent = "Canli akis yeniden baglanmaya calisiyor";
  };
}

function showShell() {
  refs.auth.classList.add("hidden");
  refs.shell.classList.remove("hidden");
  refs.bottomNav.classList.remove("hidden");
  showPage("dashboard");
}

function showAuth() {
  refs.shell.classList.add("hidden");
  refs.bottomNav.classList.add("hidden");
  refs.auth.classList.remove("hidden");
  refs.password.value = "";
  closeRegisterPanel();
  closeForgotPanel();
  refs.username.focus();
}

async function login() {
  const username = refs.username.value.trim();
  const password = refs.password.value.trim();

  if (!username || !password) {
    window.alert("Lutfen kullanici adi ve sifre girin.");
    return;
  }

  try {
    const response = await api("/api/auth/login", {
      body: JSON.stringify({ password, username }),
      method: "POST",
    });

    appState.token = response.token;
    appState.user = response.user;
    window.localStorage.setItem("bytsToken", response.token);
    showShell();
    await loadDashboard();
  } catch (error) {
    const message = error.message.includes("Kullanici adi veya sifre hatali")
      ? "Kullanici adi veya sifre hatali."
      : `Backend baglantisi kurulamadi. Once 'node server.js' calistir.\n\nDetay: ${error.message}`;
    window.alert(message);
  }
}

async function registerAccount() {
  const displayName = refs.registerDisplayName.value.trim();
  const email = refs.registerEmail.value.trim();
  const relation = refs.registerRelation.value.trim();
  const phone = refs.registerPhone.value.trim();
  const username = refs.registerUsername.value.trim();
  const password = refs.registerPassword.value.trim();
  const passwordConfirm = refs.registerPasswordConfirm.value.trim();

  if (!displayName || !username || !password || !passwordConfirm) {
    setRegisterMessage("Zorunlu alanlari doldur.", true);
    return;
  }

  if (password !== passwordConfirm) {
    setRegisterMessage("Sifre alanlari eslesmiyor.", true);
    return;
  }

  if (!phone && !email) {
    setRegisterMessage("Telefon veya e-posta alanlarindan birini gir.", true);
    return;
  }

  if (email && !isValidEmail(email)) {
    setRegisterMessage("Gecerli bir e-posta adresi gir.", true);
    return;
  }

  try {
    setRegisterMessage("Kayit olusturuluyor...");
    const response = await api("/api/auth/register", {
      body: JSON.stringify({
        displayName,
        email,
        password,
        passwordConfirm,
        phone,
        relation,
        username,
      }),
      method: "POST",
    });

    appState.token = response.token;
    appState.user = response.user;
    window.localStorage.setItem("bytsToken", response.token);
    refs.username.value = username;
    refs.password.value = password;
    clearRegisterForm();
    closeRegisterPanel();
    showShell();
    await loadDashboard();
  } catch (error) {
    setRegisterMessage(error.message, true);
  }
}

async function requestResetCode() {
  const username = refs.forgotUsername.value.trim();
  const channel = refs.forgotChannel.value;
  const phone = refs.forgotPhone.value.trim();
  const email = refs.forgotEmail.value.trim();

  if (!username) {
    setForgotMessage("Kullanici adini gir.", true);
    return;
  }

  if (channel === "sms" && !phone) {
    setForgotMessage("Kayitli telefon numarasini gir.", true);
    return;
  }

  if (channel === "email" && !email) {
    setForgotMessage("Kayitli e-posta adresini gir.", true);
    return;
  }

  if (channel === "email" && !isValidEmail(email)) {
    setForgotMessage("Gecerli bir e-posta adresi gir.", true);
    return;
  }

  try {
    setForgotMessage("Dogrulama kodu gonderiliyor...");
    const response = await api("/api/auth/request-reset-code", {
      body: JSON.stringify({
        channel,
        email,
        phone,
        username,
      }),
      method: "POST",
    });

    appState.forgotRequest = {
      channel,
      cooldownUntil: response.cooldownUntil,
      deliveryHint: response.deliveryHint,
      deliveryMode: response.deliveryMode,
      expiresAt: response.expiresAt,
      username,
    };

    const summaryParts = [
      `${channel === "sms" ? "SMS" : "E-posta"} kodu ${response.deliveryHint} adresine gonderildi.`,
    ];

    if (response.deliveryMode === "demo" && response.demoCode) {
      summaryParts.push(`Test modu kodu: ${response.demoCode}`);
    }

    refs.forgotSummary.textContent = summaryParts.join(" ");
    setForgotStep("confirm");
    setForgotMessage(
      response.deliveryMode === "demo" && response.demoCode
        ? `${response.message} Test modu aktif oldugu icin kod ekranda gosterildi.`
        : response.message,
    );
    startForgotCountdown();
    refs.forgotCode.focus();
  } catch (error) {
    setForgotMessage(error.message, true);
  }
}

async function resetPassword() {
  const username = refs.forgotUsername.value.trim();
  const code = refs.forgotCode.value.trim();
  const newPassword = refs.forgotPassword.value.trim();
  const passwordConfirm = refs.forgotPasswordConfirm.value.trim();

  if (!username || !code || !newPassword || !passwordConfirm) {
    setForgotMessage("Kod ve yeni sifre alanlarini doldur.", true);
    return;
  }

  if (!appState.forgotRequest || appState.forgotRequest.username !== username) {
    setForgotMessage("Once dogrulama kodu iste.", true);
    return;
  }

  if (newPassword !== passwordConfirm) {
    setForgotMessage("Yeni sifre alanlari eslesmiyor.", true);
    return;
  }

  try {
    setForgotMessage("Sifre guncelleniyor...");
    const response = await api("/api/auth/reset-password", {
      body: JSON.stringify({
        code,
        newPassword,
        passwordConfirm,
        username,
      }),
      method: "POST",
    });

    refs.username.value = username;
    refs.password.value = newPassword;
    clearForgotCountdown();
    clearForgotForm();
    closeForgotPanel();
    window.alert(response.message || "Sifre guncellendi. Yeni sifrenle giris yapabilirsin.");
  } catch (error) {
    setForgotMessage(error.message, true);
  }
}

function logout() {
  if (appState.stream) {
    appState.stream.close();
    appState.stream = null;
  }
  appState.token = "";
  appState.user = null;
  window.localStorage.removeItem("bytsToken");
  showAuth();
}

refs.loginBtn.addEventListener("click", login);
refs.logoutBtn.addEventListener("click", logout);
refs.forgotCancelBtn.addEventListener("click", closeForgotPanel);
refs.forgotChannel.addEventListener("change", updateForgotChannelFields);
refs.forgotRequestBtn.addEventListener("click", requestResetCode);
refs.forgotResendBtn.addEventListener("click", requestResetCode);
refs.registerCancelBtn.addEventListener("click", closeRegisterPanel);
refs.forgotSubmitBtn.addEventListener("click", resetPassword);
refs.registerSubmitBtn.addEventListener("click", registerAccount);

document.querySelectorAll("button[data-page]").forEach((button) => {
  button.addEventListener("click", () => showPage(button.getAttribute("data-page")));
});

refs.forgotLink.addEventListener("click", (event) => {
  event.preventDefault();
  if (refs.forgotPanel.classList.contains("hidden")) {
    openForgotPanel();
    return;
  }

  closeForgotPanel();
});

refs.createAccountBtn.addEventListener("click", () => {
  if (refs.registerPanel.classList.contains("hidden")) {
    openRegisterPanel();
    return;
  }

  closeRegisterPanel();
});

window.setTimeout(() => {
  refs.splash.classList.add("hidden");
  refs.auth.classList.remove("hidden");
  refs.username.focus();
}, 700);
