## Content Server

Backend API for RightsContent, built with Express and Prisma. It exposes:

- **Public API** used by the public frontend (`content-frontend`)
- **Admin API** used by the content admin app (`content-admin`)

It integrates with:

- **PostgreSQL** via Prisma
- **Supabase storage** for media assets (e.g. artworks)
- Optional **email** via Nodemailer

### Tech stack

- **Runtime**: Node.js (ES modules)
- **Framework**: Express 5
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Auth / crypto**: `bcrypt`, `jsonwebtoken`
- **Storage / CDN**: Supabase (via `@supabase/supabase-js`)
- **Uploads**: `multer`, `sharp` for image processing
- **Validation**: `zod`

### Project structure (high level)

- `src/index.ts` – Express app entrypoint, CORS config, route wiring
- `src/routes/public` – public-facing APIs (videos, artworks, tags)
- `src/routes/admin` – admin-only APIs (create/update/delete)
- `prisma/schema.prisma` – Prisma schema (models, relations)
- `prisma/generated` – generated Prisma client and model helpers
- `prisma/seed.ts` – optional data seeding script

### Environment variables

Environment variables are loaded from `.env` via `dotenv/config`. **Do not commit real secrets.**

Core variables:

- **`DATABASE_URL`** – connection string to your Postgres instance (Prisma format).
- **`PORT`** – HTTP port for the API (default: `4000`).

Supabase / storage:

- **`SUPABASE_URL`** – Supabase project URL.
- **`SUPABASE_SERVICE_ROLE_KEY`** – Supabase service key (keep secret).
- **`SUPABASE_JWT_SECRET`** – JWT secret used for Supabase tokens.
- **`SUPABASE_BUCKET`** – bucket name for storing artwork images.

You should create a `.env` file locally with placeholder values and keep real secrets in your deployment environment (e.g. server env, cloud platform secrets).

### Getting started (development)

1. **Install dependencies**:

   ```bash
   cd content-server
   npm install
   ```

2. **Create a `.env` file** with at least:

   - `DATABASE_URL=...`
   - `PORT=4000` (or another port)
   - Supabase-related variables if you plan to use image uploads.

3. **Generate the Prisma client**:

   ```bash
   npm run generate
   ```

4. **Run database migrations**:

   ```bash
   npm run migrate
   ```

5. (Optional) **Seed the database**:

   ```bash
   npm run seed
   ```

6. **Start the dev server**:

   ```bash
   npm run dev
   ```

   The API will listen on `http://localhost:4000` by default (or the value of `PORT`).

### Building and running in production

Create a production build and start the compiled server:

```bash
cd content-server
npm run build
npm start
```

This will:

- Run `prisma generate`
- Compile TypeScript to `dist/`
- Start `dist/src/index.js` with Node.js

Set `PORT` in the environment if you need a different port.

### CORS and allowed origins

`src/index.ts` configures CORS to allow requests from:

- `https://www.rightscontent.com`
- `https://rightscontent.com`
- `https://admin.rightscontent.com`
- `http://localhost:3000` (frontend dev)
- `http://localhost:3001` (admin dev)

Adjust this list if you deploy to different domains or ports.

### API overview

Base URL (local): `http://localhost:4000`

#### Public endpoints

- **Videos**
  - `GET /api/videos`
    - Query params:
      - `page` (number, default 1)
      - `pageSize` (number, default 12)
      - `recommended=true`
      - `featured=true`
      - `sort=recent`
  - `GET /api/videos/:slug`
  - `GET /api/videos/:slug/suggestions`
  - `POST /api/videos/:slug/view` – increments view count

- **Artworks**
  - `GET /api/artworks`
    - Query params:
      - `page` (number, default 12)
      - `pageSize` (number, default 12)
      - `featured=true`
  - `GET /api/artworks/:slug`
  - `GET /api/artworks/:slug/suggestions`

- **Tags**
  - `GET /api/tags`

All list endpoints return a `PaginatedResponse<T>`:

- `data: T[]`
- `total: number`
- `page: number`
- `pageSize: number`

#### Admin endpoints

Used by the `content-admin` app. All are mounted under `/api/admin`:

- `GET /api/admin/videos`
- `POST /api/admin/videos`
- `GET /api/admin/videos/:id`
- `PUT /api/admin/videos/:id`
- `DELETE /api/admin/videos/:id`

- `GET /api/admin/artworks`
- `POST /api/admin/artworks` (multipart upload with image)
- `GET /api/admin/artworks/:id`
- `PUT /api/admin/artworks/:id`
- `DELETE /api/admin/artworks/:id`

- `GET /api/admin/tags`
- `POST /api/admin/tags`
- `PUT /api/admin/tags/:id`
- `DELETE /api/admin/tags/:id`

Authentication and authorization for admin routes should be enforced at the Express layer (for example via a middleware that validates JWTs). The initial codebase comments indicate that stricter auth can be added as needed.

### Development workflow

Typical local setup:

1. Run `content-server` on port `4000`.
2. Run `content-frontend` with `NEXT_PUBLIC_API_URL=http://localhost:4000`.
3. Run `content-admin` with `NEXT_PUBLIC_CONTENT_API_URL=http://localhost:4000`.

With this configuration:

- Admins can create and edit content in `content-admin`.
- The server persists it (Postgres + Supabase).
- The public frontend reads it immediately from `content-server`.

