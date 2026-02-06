# iMacros Privacy Policy

**Last Updated:** February 2026

## Overview

iMacros is a browser automation extension that helps you record and replay web tasks. We are committed to protecting your privacy and being transparent about our data practices.

## Data Collection

### What We DO NOT Collect

- We do not collect any personal information
- We do not track your browsing history
- We do not send any data to external servers
- We do not use analytics or tracking services
- We do not share any data with third parties

### What the Extension Stores Locally

The following data is stored locally on your device using Chrome's storage API:

- **Macros**: The automation scripts you create
- **Settings**: Your extension preferences
- **Variables**: Data extracted during macro execution

All data remains on your device and is never transmitted externally.

## Permissions Explained

### tabs
Used to interact with browser tabs during macro playback, such as navigating to URLs or switching between tabs.

### storage
Used to save your macros and settings locally on your device.

### sidePanel
Used to display the iMacros interface in the browser's side panel.

### webRequest
Used to monitor network requests during macro recording to capture form submissions.

### nativeMessaging
Used for optional communication with the native host application for file system access (reading/writing macro files to disk).

### declarativeNetRequest
Used for handling network-related macro commands.

### host_permissions (<all_urls>)
Required to record and playback macros on any website you choose to automate. The extension only interacts with pages when you explicitly run a macro.

## Data Security

- All data is stored locally using Chrome's secure storage APIs
- Macros are stored in plain text format for transparency
- No encryption keys or passwords are stored by the extension itself

## Native Host (Optional)

If you install the optional native host application:
- It enables reading and writing macro files to your local file system
- Communication occurs only between the browser extension and the local application
- No network communication is involved

## Children's Privacy

This extension is not directed at children under 13 and we do not knowingly collect information from children.

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be reflected in the "Last Updated" date.

## Contact

For privacy-related questions or concerns, please open an issue on our GitHub repository.

## Your Rights

Since we don't collect any personal data, there is no personal data to access, modify, or delete. You can uninstall the extension at any time to remove all locally stored data.
