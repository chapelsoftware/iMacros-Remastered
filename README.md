# iMacros Remastered

[![CI](https://github.com/chapelsoftware/iMacros-Remastered/actions/workflows/ci.yml/badge.svg)](https://github.com/chapelsoftware/iMacros-Remastered/actions/workflows/ci.yml)

A modern implementation of iMacros for Firefox.

## Development

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
npm install
```

### Build

```bash
npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Type Checking

```bash
npm run typecheck
```

## Project Structure

- `extension/` - Firefox extension code
- `native-host/` - Native messaging host
- `shared/` - Shared utilities and types
- `tests/` - Test suites (unit, integration, e2e)

## License

UNLICENSED
