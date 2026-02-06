# iMacros Tray Icons

This directory contains system tray icons for the iMacros Native Host.

## Required Icon Files

### Windows (.ico)
- `tray-icon.ico` - Default/idle state (16x16, 32x32, 48x48 multi-resolution)
- `tray-icon-recording.ico` - Recording state (red indicator)
- `tray-icon-playing.ico` - Playing state (green indicator)

### macOS (Template images)
- `tray-iconTemplate.png` - Default/idle state (16x16 @1x, 32x32 @2x)
- `tray-iconTemplate@2x.png` - Retina version
- `tray-icon-recordingTemplate.png` - Recording state
- `tray-icon-playingTemplate.png` - Playing state

Note: macOS template images should be black and transparent only.
The system will automatically apply appropriate colors for light/dark mode.

### Linux (.png)
- `tray-icon.png` - Default/idle state (16x16 or 22x22)
- `tray-icon-recording.png` - Recording state
- `tray-icon-playing.png` - Playing state

## Design Guidelines

1. Keep icons simple and recognizable at small sizes
2. Use the iMacros "iM" logo or a stylized macro/play button
3. Status indicators:
   - Idle: Blue or neutral color
   - Recording: Red indicator (e.g., red dot overlay)
   - Playing: Green indicator (e.g., green play triangle)

## Placeholder Icons

Until proper icons are designed, the application will use Electron's
default empty tray icon or a generated placeholder.
