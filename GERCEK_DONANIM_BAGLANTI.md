# Gercek Donanim Baglanti Plani

Bu belge, paylastigin siparis ekranindaki mevcut donanima gore hazirlandi.

## Elde oldugu gorulen parcalar

- `ESP32 ESP-32S`
- `Manyetik kapi alarm sensoru`
- `HC-SR501 PIR hareket sensoru`
- `LDR isik sensoru karti (3 pin)`
- `Pasif buzzer modulu`

## Bu kit ile gercekten calisacak ozellikler

- `Kapi acik / kapali takibi`
- `Hareket algilama`
- `Karanlik / aydinlik algilama`
- `Yerel sesli uyari (buzzer)`

## Bu kit ile su an fiziksel olarak yapamayacaklariniz

- `Gaz / duman algilama`
- `Sicaklik / nem olcumu`
- `Dusme tespiti`
- `Kamera analizi`
- `Raspberry Pi tarafli goruntu isleme`

Rapor bunlari istiyorsa, asagidaki ek donanimlar halen eksik:

- `Gaz / duman sensoru` (`MQ-2`, `MQ-5` gibi)
- `Sicaklik / nem sensoru` (`DHT22`, `BME280` gibi)
- `Raspberry Pi 4`
- `Kamera modulu`

## Onerilen ESP32 pin baglantisi

Bu plan [devices/esp32_http_client.ino](/Users/tebareksaadi/Documents/New%20project/devices/esp32_http_client.ino) dosyasiyla uyumludur.

| Donanim | ESP32 pini | Not |
|---|---|---|
| Manyetik kapi sensoru | `GPIO14` | Bir ucu `GPIO14`, diger ucu `GND`. `INPUT_PULLUP` kullaniliyor. |
| PIR sensoru `OUT` | `GPIO27` | `VCC` genelde `5V` veya `VIN`, `GND` ortak. |
| LDR modulu `OUT/DO` | `GPIO32` | 3 pin modul dijital cikis kabul edildi. |
| Buzzer `SIG` | `GPIO25` | PWM/tone cikisi icin secildi. |

## Besleme baglantisi

### Manyetik kapi sensoru

- Bu sensor genelde pasif reed switch'tir.
- `Bir kablo -> GPIO14`
- `Diger kablo -> GND`

### HC-SR501 PIR

- `VCC -> VIN / 5V`
- `GND -> GND`
- `OUT -> GPIO27`

Not:
- PIR modulu genelde `5V` ile daha kararlidir.
- `OUT` ucu ESP32 icin genelde guvenli dijital sinyal verir.

### LDR 3 pin modulu

- `VCC -> 3V3`
- `GND -> GND`
- `OUT -> GPIO32`

Not:
- Bu modullerde uzerindeki trimpot ile karanlik esigi ayarlanir.
- Tetik ters ise kodda `LDR_ACTIVE_LOW` sabitini tersine cevir.

### Pasif buzzer modulu

- `VCC -> 3V3`
- `GND -> GND`
- `SIG -> GPIO25`

## Davranis mantigi

Mevcut firmware'e gore buzzer su durumlarda calar:

- `Kapi aciksa`
- `Karanlik ortamda hareket varsa`

## Yazilim dosyalari

- Firmware: [devices/esp32_http_client.ino](/Users/tebareksaadi/Documents/New%20project/devices/esp32_http_client.ino)
- Backend: [server.js](/Users/tebareksaadi/Documents/New%20project/server.js)
- Frontend: [app.js](/Users/tebareksaadi/Documents/New%20project/app.js)

## Dikkat edilmesi gerekenler

- `LDR` modulun 3 pin oldugu gorundugu icin analog lux degil, `karanlik / aydinlik` mantigi kullanildi.
- `Gaz`, `duman`, `sicaklik`, `nem`, `kamera dusme tespiti` alanlari bu kitte fiziksel olarak bagli degil.
- Bu alanlar raporda gerekiyorsa ek donanim alinmadan proje tam fiziksel final seviyesine cikmaz.

## Sonraki adim

Gercek cihaz kurulumunu tamamlamak icin senden halen iki sey gerekiyor:

- `ESP32 ustunde gercek kablo baglanti fotosu`
- `Raspberry Pi ve kamera sizde var mi yok mu` bilgisi

Bunlari paylasirsan bir sonraki adimda sana birebir `pin-pin son kontrol listesi` cikarayim.
