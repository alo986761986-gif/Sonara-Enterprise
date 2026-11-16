# SONARA for Android (beta)

This is the first-party Android companion to https://sonaraenterprise.com.

## What it does
- Installs an Android launcher with SONARA branding.
- Opens the existing SONARA service using Chrome Custom Tabs (or the system browser).
- Shares the browser's session for login, music generation, downloads and uploads.
- Keeps Google sign-in in a real browser, rather than an embedded WebView.
- Changes **nothing** in the SONARA website, ACE-Step, Cloudflare, Remix Pro, or GPU runtime.

## Requirements
- Android 6.0+ with an updated Android browser that supports HTTPS, audio, and the authentication providers used by SONARA.
- Internet access; audio generation is performed by existing SONARA servers, not on the phone.

## Limitations
- This is a browser-backed Android app, not a native offline audio generator.
- Functionality depends on the live SONARA website and gateway being available.
- Microphone/file permissions, Google login and downloads are managed by the browser, not by native Java code.
- The GitHub prerelease is a **debug-signed beta APK** built with an ephemeral CI keystore. A later build may require uninstalling the previous beta before installation; do not use this key for Google Play or production distribution.
- No third-party tracker, JavaScript injection, user passwords, or private API keys are bundled.

## Build
From `android-app/` with JDK 17, Android SDK API 35, Gradle 8.12:

```bash
gradle :app:assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`.

## Release
The dedicated `.github/workflows/build-sonara-android-apk.yml` workflow builds, validates signature, publishes an artifact, and attempts to attach the APK to a GitHub prerelease. It does **not** deploy the website.
