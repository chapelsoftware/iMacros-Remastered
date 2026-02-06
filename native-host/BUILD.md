# iMacros Native Host - Build Guide

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build TypeScript/Vite only |
| `npm run dist` | Build and create installers for current platform |
| `npm run dist:win` | Build Windows NSIS installer |
| `npm run dist:mac` | Build macOS DMG installer |
| `npm run dist:linux` | Build Linux AppImage and DEB packages |
| `npm run dist:all` | Build installers for all platforms |
| `npm run release` | Build and publish to GitHub releases |

## Output

Built installers are placed in `dist-electron/`:
- Windows: `iMacros Native Host-{version}-win-x64.exe`
- macOS: `iMacros Native Host-{version}-mac-{arch}.dmg`
- Linux: `iMacros Native Host-{version}-x64.AppImage`, `iMacros Native Host-{version}-x64.deb`

## Code Signing

### Windows Code Signing

Set the following environment variables:

```bash
# Certificate file (PFX/P12) - base64 encoded
export CSC_LINK="base64-encoded-certificate"
# or path to certificate file
export CSC_LINK="/path/to/certificate.pfx"

# Certificate password
export CSC_KEY_PASSWORD="your-certificate-password"

# Optional: Subject name for EV certificates
export WIN_CSC_SUBJECT_NAME="Your Company Name"

# Optional: Certificate SHA1 thumbprint for EV certificates
export WIN_CSC_SHA1="certificate-sha1-thumbprint"
```

### macOS Code Signing and Notarization

Set the following environment variables:

```bash
# Apple Developer certificate
export CSC_LINK="base64-encoded-certificate"
# or path to certificate file
export CSC_LINK="/path/to/certificate.p12"
export CSC_KEY_PASSWORD="your-certificate-password"

# For notarization
export APPLE_ID="your-apple-id@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

### Linux

No code signing required for Linux packages.

## Auto-Update Configuration

The app uses `electron-updater` for automatic updates. Configure the publish settings in `electron-builder.json`:

```json
{
  "publish": {
    "provider": "github",
    "owner": "your-github-username",
    "repo": "imacros-native-host",
    "releaseType": "release"
  }
}
```

### GitHub Token

For publishing releases, set:

```bash
export GH_TOKEN="your-github-personal-access-token"
```

### Custom Update Server

For self-hosted updates, set:

```bash
export UPDATE_FEED_URL="https://your-server.com/updates"
```

## Build Resources

Place the following files in `build/`:

- `icon.ico` - Windows icon (256x256)
- `icon.icns` - macOS icon
- `icons/` - Linux icons (various sizes: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512)
- `entitlements.mac.plist` - macOS entitlements (included)
- `installer.nsh` - NSIS custom installer script (included)

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci
        working-directory: native-host

      - name: Build and Release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: npm run release
        working-directory: native-host
```
