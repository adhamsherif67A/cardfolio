# CardFolio

CardFolio scans business cards on iPhone and Android. Its native scanner corrects perspective, and on-device text recognition suggests editable contact fields. The saved card retains the scanned design. Photos and contacts are stored locally.

## Run a development build

Use Node 20.19 or newer. Install the Android SDK for an Android local build, or use macOS with Xcode for a local iOS build.

```sh
npm install
npx expo install --check
npm run android
# On macOS for iPhone
npm run ios
```

The scanner and text recognition require a native build. For an installable Android preview, link an Expo account with `npx eas-cli init`, then run `npx eas-cli build --platform android --profile preview`. Use the equivalent iOS preview build with registered devices, or use a production iOS build with TestFlight. Confirm the bundle identifiers and signing credentials under the publisher's accounts before distribution.

## First device test

1. Scan a paper business card. Check the crop, original colors, and small print before saving.
2. Review the extracted fields, especially work and mobile phone numbers. Correct any errors.
3. Save, restart the app, and search by company. Open the card to verify its image and contact links.
4. Import a card photo from the phone's library and verify that recognition and saving still work. Library imports on iOS retain the uploaded framing. Use the camera scanner to straighten and trim a card.
5. Check cancellation, denied permissions, and deleting a test card.

The Android native scanner depends on Google Play Services. A regular camera photo is available when the scanner fails. Text extraction is tuned for English business cards. Review the scan for focus and glare before saving.

