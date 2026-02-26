# Android APK Export (GitHub-Ready)

This folder is ready to upload as a GitHub repository (or as an `app/` folder in your repo) and produce an installable Android APK.

## What this includes
- Flutter wrapper app (`lib/main.dart`) using a WebView.
- Your bundled web app in `assets/www`.
- GitHub Action at `.github/workflows/android-apk.yml` to build `app-release.apk`.

## Fastest path (no local build needed)
1. Upload this folder to a GitHub repository.
2. In GitHub: **Actions** -> **Build Android APK** -> **Run workflow**.
3. Wait for success, then open the workflow run.
4. Download artifact `sve-catalogue-apk`.
5. Transfer `app-release.apk` to your Android phone.
6. On phone: allow install from unknown apps for your file manager/browser, then install.

## Notes
- This build uses `flutter create --platforms=android .` in CI, so no pre-generated `android/` folder is required.
- The app still depends on internet for card art URLs unless you replace remote URLs with local bundled images.
- If you want store publishing later, add signing config and build an AAB.

## Optional: GitHub Release download link
If you run this workflow from a Git tag, it can attach the APK to a GitHub Release.
Example release URL pattern:
`https://github.com/<USER>/<REPO>/releases`