# Face3D Pro — aplikacja mobilna bez serwera

Projekt został przebudowany pod uruchamianie na smartfonie jako aplikacja Android
(Capacitor), gdzie frontend jest pakowany lokalnie do APK.

## Co to oznacza „bez serwera”?

Nie uruchamiasz `npm run dev` na telefonie.  
Aplikacja działa z lokalnych plików wbudowanych w APK (offline-first).

## Wymagania

- Node.js 20+
- Android Studio (SDK + emulator lub telefon z USB debugging)

## Instalacja

```bash
npm install
```

## Tryby uruchamiania

### 1) Klasyczny web (deweloperski)

```bash
npm run dev
```

### 2) Android bez serwera (zalecane)

Pierwsza konfiguracja Androida (jednorazowo):

```bash
npm run mobile:android:add
```

Przy każdej zmianie kodu:

```bash
npm run mobile:android:prepare
```

Otwórz projekt natywny i uruchom APK:

```bash
npm run mobile:android:open
```

W Android Studio wybierz urządzenie i kliknij **Run**.

Lub zbuduj APK z CLI:

```bash
npm run mobile:android:apk
```

Plik debug APK znajdziesz w:
`android/app/build/outputs/apk/debug/app-debug.apk`

## Skrócona ścieżka CLI

```bash
npm run mobile:android:run
```

To zbuduje frontend, zsynchronizuje assets i uruchomi aplikację na podłączonym urządzeniu.

## Architektura mobilna

- React + Vite buduje statyczne pliki do `dist/`
- Capacitor kopiuje `dist/` do projektu Android
- WebView ładuje aplikację lokalnie (bez zewnętrznego serwera)
