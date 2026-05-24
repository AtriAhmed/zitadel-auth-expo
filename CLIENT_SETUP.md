# Client Setup

This Expo app signs in with ZITADEL using OIDC Authorization Code Flow with PKCE.
The app does not handle passwords directly. Login, registration, password reset,
Google, and Apple are handled by the ZITADEL hosted login page.

## Current App Configuration

- Expo scheme: `zitadelexpo`
- iOS bundle ID: `com.ahmedatri.zitadelexpoauth`
- Redirect URI in ZITADEL: `zitadelexpo://auth`
- Post logout URI in ZITADEL: `zitadelexpo://auth`
- ZITADEL issuer: `https://ahmeds-auth-qaw8wn.eu1.zitadel.cloud`

The ZITADEL client ID is configured in [app/(tabs)/index.tsx](app/(tabs)/index.tsx).

## Prerequisites

Install Node.js 22 before installing dependencies.

If you use `nvm`:

```bash
nvm install 22
nvm use 22
node -v
```

Install dependencies:

```bash
npm install
```

## Running Locally

This app uses a custom URL scheme, so test with an Expo development build.
Expo Go is not the right target for this app.

Start Metro for a development build:

```bash
npx expo start --dev-client
```

If the app behaves like it is using old code, restart with the cache cleared:

```bash
npx expo start --dev-client --clear
```

## Testing on iPhone

Open the installed development build on the iPhone.

If the app does not find the development server automatically, choose
**Enter URL manually** and use the URL printed by Expo.

If you need to find the Mac's Wi-Fi IP manually:

```bash
ipconfig getifaddr en0
```

Then enter:

```text
exp://YOUR_MAC_IP:8081
```

Example:

```text
exp://192.168.1.105:8081
```

If the IP changes, update the manual URL. This commonly happens after changing
Wi-Fi networks, using a hotspot, or connecting/disconnecting a VPN.

## Creating an iOS Development Build

If the development build is not already installed on the iPhone, create one with
EAS:

```bash
npx eas-cli login
npx eas-cli build --profile development --platform ios
```

After installing the build on the iPhone, run:

```bash
npx expo start --dev-client
```

## ZITADEL Login Options

The hosted login page should be configured in ZITADEL, not in Expo.

Recommended login behavior:

- Local authentication allowed: on
- User registration allowed: on, if users may self-register
- External login allowed: on
- Password reset hidden: off
- Disable email login: off
- Organization registration allowed: off, unless users should create organizations
- Domain discovery allowed: off for simple testing

Configured methods:

- Email + password
- Password reset through ZITADEL
- Google login through ZITADEL Identity Providers
- Apple login through ZITADEL Identity Providers

ZITADEL hosted login does not provide classic email magic-link login as the
primary sign-in method. Its hosted passwordless option is passkey-based.

## Google and Apple Redirects

Google and Apple should redirect back to ZITADEL, not directly to the Expo app.

Use the callback URL shown in the ZITADEL Identity Provider setup. For this
instance it is typically:

```text
https://ahmeds-auth-qaw8wn.eu1.zitadel.cloud/idps/callback
```

The Expo app redirect remains:

```text
zitadelexpo://auth
```

## Common Issues

### Port 8081 is already in use

Stop the old Expo server, then restart:

```bash
npx expo start --dev-client --clear
```

### No development server found

Make sure:

- The Mac and iPhone are on the same Wi-Fi network.
- Metro is running with `npx expo start --dev-client`.
- The manual URL uses the current Mac IP address.
- VPN or hotspot isolation is not blocking local network access.

### Login opens ZITADEL but provider buttons are missing

In ZITADEL, make sure:

- External login is allowed.
- Google and Apple identity providers are active.
- The providers are assigned/enabled for the login policy.

### External login tries to register instead of logging in

ZITADEL treats local users and Google/Apple identities as separate identities
until they are linked.

Enable account linking or auto-linking in the identity provider settings, or log
in with the local user first and link the external identity from the user profile.
