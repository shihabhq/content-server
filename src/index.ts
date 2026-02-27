import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

// Public routes
import videoPublicRoutes from "./routes/public/videos.js";
import artworkPublicRoutes from "./routes/public/artwork.js";
import tagPublicRoutes from "./routes/public/tags.js";

// Admin routes
import videoAdminRoutes from "./routes/admin/videos.js";
import artworkAdminRoutes from "./routes/admin/artworks.js";
import tagAdminRoutes from "./routes/admin/tags.js";

const app = express();

app.use(
  cors({
    origin: [
      "https://www.rightscontent.com",
      "https://admin.rightscontent.com",
      "https://rightscontent.com",
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

app.get("/", (_req, res) => {
  res.json({ message: "Server is running 🚀" });
});

// Public API
app.use("/api/videos", videoPublicRoutes);
app.use("/api/artworks", artworkPublicRoutes);
app.use("/api/tags", tagPublicRoutes);

// Admin API (no auth check on initial launch; add requireAdminAuth when ready)
app.use("/api/admin/videos", videoAdminRoutes);
app.use("/api/admin/artworks", artworkAdminRoutes);
app.use("/api/admin/tags", tagAdminRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
