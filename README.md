# BYTS Tam Prototip

Bu klasor artik sadece statik HTML degil, tam calisan bir full-stack BYTS prototipi icerir:

- web panel frontend
- Node.js backend API
- canli veri akisi (SSE)
- olay gecmisi ve ayarlar
- sensor veri ingest API'si
- ESP32 gonderim ornegi
- Raspberry Pi gateway / simulasyon scripti

## Neler hazir

- giris, kayit ve sifre sifirlama akisi
- dashboard, canli durum ve olay gecmisi
- `/api/sensors/ingest` ile disaridan veri alma
- kalici veri dosyalari (`data/`)
- production icin Docker ve `.env` iskeleti
- sifre sifirlama icin gercek servis baglantilari:
  - `Resend` ile e-posta
  - `Twilio` ile SMS
  - veya custom webhook

## Yerelde calistirma

```bash
npm start
```

Tarayicida ac:

```text
http://localhost:8080
```

Varsayilan sunum hesabi:

- kullanici adi: `vasi`
- sifre: `Byts2026!`

## Ortam degiskenleri

Uretim ortaminda `.env.example` dosyasindaki alanlari doldur:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=8080`
- `PUBLIC_BASE_URL=https://senin-domainin.com`
- `ALLOW_ASSISTED_RESET=false`

Sifre sifirlama icin iki secenekten birini kullan:

- E-posta:
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
  - veya `RESET_EMAIL_WEBHOOK_URL`
- SMS:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_FROM_PHONE`
  - veya `RESET_SMS_WEBHOOK_URL`

`ALLOW_ASSISTED_RESET=false` iken servis ayari yoksa backend dogrulama kodu gondermez; bu bilincli olarak production davranisidir. `ALLOW_ASSISTED_RESET=true` ise kayitli bilgiler eslesirse kontrollu sifre yenileme oturumu acilir.

## Docker ile calistirma

Build:

```bash
docker build -t byts-platform .
```

Run:

```bash
docker run --rm -p 8080:8080 --env-file .env byts-platform
```

## API ozeti

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/request-reset-code`
- `POST /api/auth/reset-password`
- `GET /api/state`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/events`
- `GET /api/stream`
- `POST /api/sensors/ingest`
- `POST /api/simulate/scenario`

`/api/health` icinde reset servislerinin konfig statusu da doner.

## Donanim notu

Elinizdeki mevcut kit ile dogrudan baglanabilenler:

- kapi sensoru
- PIR hareket sensoru
- LDR isik sensoru
- buzzer
- ESP32 uzerinden backend'e veri gonderme

Baglanti plani:

- [GERCEK_DONANIM_BAGLANTI.md](/Users/tebareksaadi/Documents/New%20project/GERCEK_DONANIM_BAGLANTI.md)
- [devices/esp32_http_client.ino](/Users/tebareksaadi/Documents/New%20project/devices/esp32_http_client.ino)

Rapordaki tum fiziksel sistemi birebir tamamlamak icin ayrica su donanimlar gerekir:

- gaz / duman sensoru
- sicaklik / nem sensoru
- Raspberry Pi 4
- kamera modulu

## Onemli gercek durum

Bu repo su anda production'a cikabilecek kadar toparlandi; fakat su iki sey yine sizden gelir:

- domain / hosting hesabina giris
- gercek donanimin sizin backend URL'inize veri gonderecek sekilde ayarlanmasi

Kod tarafinda gercek servis baglantisi hazir, fakat dis servis anahtarlari ve domain hesabiniz bende olmadigi icin bunlari sizin adiniza aktiflestiremiyorum.
