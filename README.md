# DocuGenie Backend MVP

DocuGenie is a SaaS idea for turning raw student or business content into polished downloadable documents.

This repository contains the first backend MVP built with Node.js and Express. Right now it focuses on one working flow:

1. Accept raw text with document details.
2. Send that content to Gemini AI for formatting.
3. Generate a clean `.docx` file.
4. Return document metadata, preview text, and file information.

The project is intentionally simple, modular, and beginner-friendly so future features like auth, storage, payments, and locked previews can be added without rewriting the backend.

## Features

- Express backend with clean modular folder structure
- `POST /generate` endpoint for document generation
- `GET /documents` endpoint to list generated documents
- `GET /documents/:documentId` endpoint to fetch one generated document record
- `GET /documents/:documentId/preview` endpoint for a plain-text preview
- `GET /documents/:documentId/download` endpoint for direct file download
- `GET /health` endpoint for service status
- Placeholder routes for preview and payment flows
- Gemini AI integration for structured document formatting
- Local fallback formatter when `GEMINI_API_KEY` is missing
- `.docx` generation using the `docx` package
- Supabase client setup with clean placeholder service functions
- Security middleware with `helmet`, `cors`, `morgan`, and `express-rate-limit`
- Request validation and centralized error handling
- Local file output to `/generated`

## Tech Stack

- Node.js
- Express
- Gemini AI via `@google/genai`
- Supabase via `@supabase/supabase-js`
- DOCX generation via `docx`
- `dotenv`
- `cors`
- `helmet`
- `morgan`
- `express-rate-limit`
- `multer` installed for future image upload support

## Folder Structure

```text
docugenie-backend/
├─ generated/
├─ uploads/
├─ src/
│  ├─ config/
│  │  ├─ gemini.js
│  │  └─ supabase.js
│  ├─ controllers/
│  │  └─ generateController.js
│  ├─ middlewares/
│  │  ├─ errorHandler.js
│  │  └─ validateRequest.js
│  ├─ routes/
│  │  ├─ generateRoutes.js
│  │  ├─ healthRoutes.js
│  │  ├─ paymentRoutes.js
│  │  └─ previewRoutes.js
│  ├─ services/
│  │  ├─ aiService.js
│  │  ├─ docxService.js
│  │  └─ supabaseService.js
│  ├─ utils/
│  │  ├─ apiResponse.js
│  │  └─ logger.js
│  ├─ app.js
│  └─ server.js
├─ .env.example
├─ .gitignore
├─ package.json
└─ README.md
```

## Setup Instructions

### 1. Move into the project

```bash
cd docugenie-backend
```

### 2. Install dependencies

If you already have this repository, dependencies are already defined in `package.json`.

To install them manually:

```bash
npm install
```

### 3. Create your environment file

Copy `.env.example` to `.env` and fill in the real values.

Example:

```env
PORT=5000
NODE_ENV=development
APP_BASE_URL=http://localhost:5000
CORS_ORIGIN=*
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | Port for the Express server. Default is `5000`. |
| `NODE_ENV` | No | `development` or `production`. |
| `APP_BASE_URL` | No | Used to build the returned file download URL. |
| `CORS_ORIGIN` | No | Allowed frontend origin. Use `*` during local development. |
| `RATE_LIMIT_WINDOW_MS` | No | Rate-limit window in milliseconds. |
| `RATE_LIMIT_MAX` | No | Maximum requests allowed per window. |
| `GEMINI_API_KEY` | Recommended | Enables real Gemini formatting. |
| `GEMINI_MODEL` | No | Gemini model name. Default is `gemini-2.5-flash`. |
| `SUPABASE_URL` | Optional for now | Prepares the reusable Supabase client. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional for now | Service-role key for backend storage/database actions. |

## How to Run Locally

### Development mode

```bash
npm run dev
```

### Production mode

```bash
npm start
```

After starting the server, the backend will be available at:

```text
http://localhost:5000
```

## API Endpoints

### `GET /health`

Returns a simple health response.

Example response:

```json
{
  "success": true,
  "message": "DocuGenie backend is healthy.",
  "data": {
    "service": "docugenie-backend",
    "status": "ok",
    "timestamp": "2026-04-18T12:00:00.000Z",
    "uptimeSeconds": 12.34
  }
}
```

### `POST /generate`

Generates a formatted document and stores a `.docx` file in the local `generated/` folder.

#### Request body

```json
{
  "title": "Climate Change Assignment",
  "rawText": "climate change is affecting many countries. causes include pollution, deforestation, and overuse of fossil fuels. solutions include renewable energy, public awareness, and policy reform.",
  "subject": "Environmental Science",
  "style": "formal"
}
```

#### Request fields

| Field | Required | Description |
| --- | --- | --- |
| `title` | No | Optional document title. |
| `rawText` | Yes | The raw unformatted text to process. |
| `subject` | No | Subject or topic label. |
| `style` | No | One of `formal`, `academic`, `professional`, `simple`. |

#### Success response

```json
{
  "success": true,
  "message": "Document generated successfully.",
  "data": {
    "metadata": {
      "documentId": "climate-change-assignment-1713440000000-1234abcd",
      "title": "Climate Change Assignment",
      "subject": "Environmental Science",
      "style": "formal",
      "aiProvider": "gemini",
      "usedFallback": false,
      "generatedAt": "2026-04-18T12:00:00.000Z"
    },
    "formattedPreview": "Introduction text...",
    "lockedPreview": {
      "isLocked": true,
      "visiblePreview": "Partial preview text...",
      "message": "Preview locking is a placeholder for the future frontend + payment flow."
    },
    "structuredContent": {
      "title": "Climate Change Assignment",
      "introduction": "Improved introduction...",
      "sections": [
        {
          "heading": "Causes of Climate Change",
          "paragraphs": ["Paragraph 1"],
          "bulletPoints": ["Point 1", "Point 2"]
        }
      ],
      "conclusion": "Improved conclusion...",
      "previewText": "Combined readable preview..."
    },
    "file": {
      "fileName": "climate-change-assignment-1713440000000-1234abcd.docx",
      "relativePath": "/generated/climate-change-assignment-1713440000000-1234abcd.docx",
      "downloadUrl": "http://localhost:5000/generated/climate-change-assignment-1713440000000-1234abcd.docx",
      "sizeInBytes": 14322,
      "detailsUrl": "http://localhost:5000/documents/climate-change-assignment-1713440000000-1234abcd",
      "previewUrl": "http://localhost:5000/documents/climate-change-assignment-1713440000000-1234abcd/preview",
      "directDownloadUrl": "http://localhost:5000/documents/climate-change-assignment-1713440000000-1234abcd/download"
    },
    "localRecord": {
      "recordPath": "/generated/climate-change-assignment-1713440000000-1234abcd.json",
      "previewTextPath": "/generated/climate-change-assignment-1713440000000-1234abcd.txt"
    }
  }
}
```

#### Validation errors

If `rawText` is empty, the API returns a `400` response with a helpful validation message.

### `GET /preview`

Placeholder route for the future locked preview flow.

### `GET /documents`

Returns the locally saved generated documents with direct links for details, preview, and download.

### `GET /documents/:documentId`

Returns the full saved record for one generated document.

### `GET /documents/:documentId/preview`

Returns a plain-text preview so you can read the result directly in the browser or terminal.

### `GET /documents/:documentId/download`

Downloads the `.docx` file with the correct file headers.

### `POST /payment/initiate`

Placeholder route for payment initialization.

### `POST /payment/verify`

Placeholder route for payment verification.

## Gemini AI Formatting Flow

The backend sends your `rawText` to Gemini and asks for structured JSON in this shape:

- `title`
- `introduction`
- `sections`
- `conclusion`

This makes it much easier to convert the output into a `.docx` document.

Important:

- If `GEMINI_API_KEY` is provided, the backend uses Gemini.
- If `GEMINI_API_KEY` is missing, the backend uses a safe local fallback formatter so beginners can still test the full API flow.
- If Gemini is configured but the API call fails, the backend returns a useful `502` error.

## DOCX Generation Flow

The backend converts the formatted structure into a readable `.docx` file with:

- A title
- An introduction
- Section headings
- Paragraphs
- Bullet points
- A conclusion

Files are saved in:

```text
generated/
```

Each file name is unique and includes a timestamp plus a short UUID segment.

For each generated document, the backend also saves:

- a `.txt` preview file for easy reading
- a `.json` record file used by the `/documents` routes

## Supabase Preparation

Supabase is not fully implemented yet, but the project is prepared for it.

Current setup:

- `src/config/supabase.js` creates the reusable client
- `src/services/supabaseService.js` includes placeholder functions for:
  - saving document metadata
  - saving user info
  - storing generated file references

These functions currently return safe placeholder responses instead of breaking the app.

## Future Roadmap

- Frontend upload and paste UI
- Image upload support with `multer`
- Locked preview screen
- Payment integration
- Supabase auth
- Supabase storage for generated files
- Supabase database for user/document history
- Chat-style document editor
- Export improvements for different templates and styles

## Deployment Notes

### Render

- Good option for hosting this Express backend
- Add your `.env` values in the Render dashboard
- Use `npm install` as the build command
- Use `npm start` as the start command
- For production, store generated documents in Supabase Storage instead of the local filesystem

### Vercel

- Best for the future frontend
- This backend can later be split into serverless functions, but Render is simpler for the current Express server

### Supabase

- Use Supabase Auth for sign-in later
- Use Supabase Database for users, documents, and payment status
- Use Supabase Storage for generated `.docx` files and uploaded images

## Beginner Notes

- Start with `/health` to confirm the server is running.
- Then test `/generate` with Postman, Thunder Client, or `curl`.
- If you have not added a Gemini API key yet, the API still works through the fallback formatter.
- When you are ready for production, replace local file storage with Supabase Storage or another object storage service.

## Quick Test with cURL

```bash
curl -X POST http://localhost:5000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "title": "DocuGenie Demo",
    "rawText": "Artificial intelligence helps automate document formatting. It can improve readability, structure, and consistency. Businesses and students can save time by generating polished files quickly.",
    "subject": "Technology",
    "style": "formal"
  }'
```

## What Is Not Implemented Yet

- Real user authentication
- Real Supabase persistence
- Real payment gateway integration
- Real preview locking logic
- Image uploads inside `/generate`

These are intentionally left as safe placeholders so the backend remains stable and easy to extend.
