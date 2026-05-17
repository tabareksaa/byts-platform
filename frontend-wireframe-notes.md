# BYTS Frontend Wireframe Notes

Bu teslim, proje raporundaki `1.2 Calisma Prensibi` ve `1.3 Calisma Is Akisi` bolumlerine gore hazirlandi.

Hazirlanan dosya:

- `byts-wireframe.html`: Bu haftaki tel cerceve teslimi. Masaustu dashboard ve mobil vasi ekranlarini ayni sayfada gosterir.

Wireframe'de esas alinan proje riskleri:

- Ani dusme ve bayilma
- Gaz / duman kacagi
- Ani sicaklik artisi
- Karanlikta hareket algilanmasi
- Kapi acik kalmasi veya evden cikis takibi

Dashboard'ta neden bu alanlar var:

- `Kritik alarm alani`: Vasinin ilk bakista risk gormesi icin
- `Sensor ozeti`: Gaz, sicaklik, kapi ve hareket durumunu tek ekranda toplamak icin
- `Canli kamera / dusme kutusu`: OpenCV veya model sonucu ile dogrulama yapilabilmesi icin
- `Olay akisi`: Son olaylarin zaman damgasi ile izlenebilmesi icin
- `Hizli aksiyonlar`: Alarm geldiğinde kullanicinin beklemeden aksiyon alabilmesi icin

Mobil tarafta secilen temel ekranlar:

- Ana ekran
- Alarm detay ekrani
- Gecmis ve ayarlar ekrani

Sunumda kisa anlatim icin kullanabilecegin metin:

- "Bu tel cercevede once kritik olaylari gorunur yaptim, cunku sistemin birincil kullanicisi vasi olacak."
- "Dashboard yapisini sensorden gelen veri turlerine gore ayirdim: canli durum, gecmis, kamera ve ayarlar."
- "Mobil tarafta kullanicinin en hizli aksiyonu alabilmesi icin ana ekranda alarm ve hizli islem butonlarini one koydum."
