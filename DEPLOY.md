# BYTS Deploy Rehberi

Bu proje statik site degil. `index.html` tek basina Netlify'ye atilarak tam calismaz, cunku:

- Node.js backend var
- sifre sifirlama endpointleri var
- sensor ingest endpointi var
- canli veri akisi var

Bu yuzden Node calistiran bir host gerekir.

## En pratik yontem

- domain: diledigin registrar
- hosting: Railway / Render / Fly.io / VPS
- uygulama: bu klasorun tamami

## 1. Uretim ayarlari

Once proje kokune `.env` dosyasi ac ve en az su alanlari doldur:

```bash
NODE_ENV=production
HOST=0.0.0.0
PORT=8080
APP_NAME=BYTS
PUBLIC_BASE_URL=https://senin-domainin.com
ALLOW_DEMO_RESET_CODES=false
```

Sifre sifirlama icin asagidaki ciftlerden birini sec:

E-posta:

```bash
RESEND_API_KEY=
RESEND_FROM_EMAIL=BYTS <noreply@senin-domainin.com>
```

veya:

```bash
RESET_EMAIL_WEBHOOK_URL=
```

SMS:

```bash
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_PHONE=
```

veya:

```bash
RESET_SMS_WEBHOOK_URL=
```

## 2. Host'a yukleme

Git ile veya zip olarak tum projeyi yukle. Statik dosya degil, komple klasor gitmeli:

- `server.js`
- `app.js`
- `index.html`
- `assets/`
- `data/`
- `devices/`

Host start command:

```bash
npm start
```

Health check:

```text
/api/health
```

## 3. Docker ile deploy etmek istersen

Bu repo icinde `Dockerfile` hazir.

Local build:

```bash
docker build -t byts-platform .
```

Local run:

```bash
docker run --rm -p 8080:8080 --env-file .env byts-platform
```

Ayni image'i Railway, Render, Fly.io veya VPS tarafina da verebilirsin.

## 4. Domain baglama

Host panelinde sana verilen public adres hazir olunca:

1. domain paneline gir
2. hostun istedigi DNS kaydini ekle
3. `PUBLIC_BASE_URL` degerini kendi domaininle ayni yap
4. SSL aktif olduktan sonra tekrar test et

Genel mantik:

- kok domain icin `A` veya `CNAME flattening`
- `www` icin `CNAME`

Tam kayit tipi hosta gore degisir; host panelinde ne veriliyorsa birebir onu kullan.

## 5. Sensorlerin sana veri gondermesi

Arkadasinin cihazlari veriyi senin production endpointine gondermeli:

```text
https://senin-domainin.com/api/sensors/ingest
```

`localhost` veya kendi bilgisayarindaki private IP'ye gonderirse veri senin panelinde gorunmez.

## 6. Son kontrol listesi

- site domain uzerinden aciliyor
- `POST /api/auth/register` calisiyor
- `POST /api/auth/request-reset-code` gercek servisle kod gonderiyor
- `POST /api/auth/reset-password` calisiyor
- `GET /api/stream` ile canli akis acik
- `POST /api/sensors/ingest` disaridan veri aliyor
- dashboard veriyi gosteriyor

## 7. Demo modunu kapatma

Production'a cikarken mutlaka:

```bash
ALLOW_DEMO_RESET_CODES=false
```

Bu sayede kod ekranda gosterilmez; servis ayari yoksa backend hata verir ve eksik konfigurasyon gizlenmez.
