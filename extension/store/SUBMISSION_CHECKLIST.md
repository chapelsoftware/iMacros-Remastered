# Chrome Web Store Submission Checklist

## Pre-Submission Requirements

### Extension Package
- [ ] Run `npm run build:zip` to create submission package
- [ ] Verify the .zip file is under 20MB
- [ ] Test the extension from the built package

### Store Assets
- [ ] Description (extension/store/description.txt) - max 16,000 characters
- [ ] Screenshots (at least 1, recommended 5) - 1280x800 or 640x400 px
- [ ] Extension icon verified (128x128 in manifest)
- [ ] Privacy policy URL hosted and accessible

### Manifest Verification
- [ ] manifest_version is 3
- [ ] name is under 45 characters
- [ ] description is under 132 characters
- [ ] version follows Chrome versioning format
- [ ] All permissions have justifications prepared

## Developer Account Setup

1. Go to https://chrome.google.com/webstore/devconsole
2. Pay one-time $5 developer registration fee (if not already done)
3. Verify account email

## Submission Steps

### 1. Create New Item
1. Click "New Item" in the Developer Dashboard
2. Upload the .zip package created by `npm run build:zip`
3. Wait for package processing

### 2. Store Listing
Fill in the following:
- **Language**: English (default)
- **Title**: iMacros
- **Summary**: Browser automation and web testing tool
- **Description**: Copy from extension/store/description.txt
- **Category**: Productivity
- **Screenshots**: Upload from extension/store/screenshots/

### 3. Privacy Practices
- **Single Purpose**: Automate browser tasks by recording and replaying user actions
- **Permission Justifications**:
  - tabs: Navigate and interact with browser tabs during macro playback
  - storage: Save macros and user preferences locally
  - sidePanel: Display the iMacros control panel
  - webRequest: Monitor requests during macro recording
  - nativeMessaging: Communicate with optional native host for file access
  - declarativeNetRequest: Handle network-related macro commands
  - host_permissions: Execute macros on user-specified websites
- **Data Usage**: No personal data collected or transmitted
- **Privacy Policy URL**: [Add hosted URL here]

### 4. Distribution
- **Visibility**: Public
- **Countries**: All countries (or select specific)
- **Pricing**: Free

### 5. Submit for Review
1. Review all entered information
2. Click "Submit for Review"
3. Wait for review (typically 1-3 business days)

## Post-Submission

### If Rejected
1. Review rejection reasons in the dashboard
2. Address all issues mentioned
3. Resubmit with fixes

### Common Rejection Reasons
- Permission not justified
- Privacy policy incomplete or inaccessible
- Screenshots don't match actual functionality
- Description contains prohibited content
- Extension doesn't work as described

### If Approved
1. Extension will be published automatically
2. Monitor reviews and ratings
3. Set up update process for future versions

## Build Command

```bash
npm run build:zip
```

This creates: `extension/dist/imacros-chrome-v1.0.0.zip`

## Useful Links

- [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [Chrome Web Store Policies](https://developer.chrome.com/docs/webstore/program-policies/)
- [Extension Quality Guidelines](https://developer.chrome.com/docs/extensions/develop/migrate/improve-extension-quality)
- [Manifest V3 Documentation](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline)
