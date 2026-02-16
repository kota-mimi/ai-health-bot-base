# AI Diet Functions

Firebase Functions Gen2 implementation for LINE Bot webhook processing.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Fill in your actual environment variables in `.env`

4. Build the project:
```bash
npm run build
```

## Development

1. Start Firebase emulators:
```bash
npm run serve
```

2. Watch for changes:
```bash
npm run build:watch
```

## Deployment

1. Deploy to Firebase:
```bash
npm run deploy
```

## Environment Variables

- `FIREBASE_PROJECT_ID`: Your Firebase project ID
- `FIREBASE_PRIVATE_KEY`: Firebase Admin SDK private key
- `FIREBASE_CLIENT_EMAIL`: Firebase Admin SDK client email
- `LINE_CHANNEL_ACCESS_TOKEN`: LINE Bot channel access token
- `LINE_CHANNEL_SECRET`: LINE Bot channel secret
- `GOOGLE_GEMINI_API_KEY`: Google Gemini API key
- `NEXT_PUBLIC_APP_URL`: Your app's URL
- `NEXT_PUBLIC_LIFF_ID`: LINE LIFF app ID

## Functions

### `lineWebhook`

Main LINE Bot webhook handler with the following features:

- **Image Analysis**: Analyzes food images using Gemini Pro Vision
- **Text Analysis**: Analyzes food descriptions using Gemini Pro
- **Learned Food Database**: Stores and retrieves user-specific food data
- **Food Database Matching**: Matches against predefined food database
- **Weight Recording**: Records weight data from text input
- **Usage Limits**: Enforces daily usage limits
- **Counseling Flow**: Guides users through initial setup

**Endpoint**: `https://asia-northeast1-{project-id}.cloudfunctions.net/lineWebhook`

**Configuration**:
- Region: `asia-northeast1` (Tokyo)
- Memory: `1GiB`
- Timeout: `540 seconds` (9 minutes)
- Max Instances: `5`

## Architecture

This Functions deployment handles the heavy processing that was previously limited by Vercel's 30-second timeout:

- **Gemini AI Analysis**: Can take up to several minutes for complex images
- **Firestore Operations**: Batch operations and complex queries
- **LINE API Calls**: Multiple API calls with retry logic
- **Learning Algorithm**: Food pattern recognition and storage

The frontend (Next.js on Vercel) handles UI/LIFF operations while this Functions deployment handles all AI processing and webhook events.