import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { supabase } from "../../lib/supabase.js";
import { upload } from "../../middleware/upload.js";
import { uniqueSlug } from "../../lib/slugify.js";
import { z } from "zod";
import sharp from "sharp";

const router = Router();
const bucket = process.env.SUPABASE_BUCKET!;

const artworkSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().optional(),
  isFeatured: z.boolean().optional().default(false),
  isPublished: z.boolean().optional().default(true),
  tagIds: z.array(z.string()).optional().default([]),
  creatorName: z.string().optional(),
  status: z.enum(["PUBLISHED", "PENDING"]).optional(),
});

async function compressImage(buffer: Buffer): Promise<Buffer> {
  let compressed = await sharp(buffer)
    .resize(1920, 1080, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  if (compressed.length > 100 * 1024) {
    compressed = await sharp(buffer)
      .resize(1920, 1080, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 60 })
      .toBuffer();
  }

  if (compressed.length > 100 * 1024) {
    compressed = await sharp(buffer)
      .resize(1280, 720, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 50 })
      .toBuffer();
  }

  return compressed;
}

// GET /api/admin/artworks
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const status = req.query.status as "PUBLISHED" | "PENDING" | undefined;

    const where: any = {};
    if (status) where.status = status;

    const [artworks, total] = await Promise.all([
      prisma.artwork.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { tags: { include: { tag: true } } },
      }),
      prisma.artwork.count({ where }),
    ]);

    res.json({ data: artworks, total, page, pageSize });
  } catch {
    res.status(500).json({ error: "Failed to fetch artworks" });
  }
});

// GET /api/admin/artworks/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const artwork = await prisma.artwork.findUnique({
      where: { id: req.params.id as string },
      include: { tags: { include: { tag: true } } },
    });

    if (!artwork) {
      res.status(404).json({ error: "Artwork not found" });
      return;
    }

    res.json(artwork);
  } catch {
    res.status(500).json({ error: "Failed to fetch artwork" });
  }
});

// POST /api/admin/artworks
router.post(
  "/",
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Image file is required" });
        return;
      }

      const parsed = artworkSchema.safeParse({
        ...req.body,
        isFeatured: req.body.isFeatured === "true",
        isPublished: req.body.isPublished === "true",
        tagIds: req.body.tagIds ? JSON.parse(req.body.tagIds) : [],
      });

      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }

      const slug = await uniqueSlug(parsed.data.title, "artwork");
      const finalBuffer = await compressImage(req.file.buffer);
      const fileName = `${slug}-${Date.now()}.webp`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, finalBuffer, {
          contentType: "image/webp",
          upsert: false,
        });

      if (uploadError) {
        res.status(500).json({ error: "Failed to upload image" });
        return;
      }

      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      const artwork = await prisma.artwork.create({
        data: {
          title: parsed.data.title,
          slug,
          content: parsed.data.content,
          imageUrl: urlData.publicUrl,
          isFeatured: parsed.data.isFeatured,
          isPublished: parsed.data.isPublished,
          creatorName: parsed.data.creatorName,
          status: parsed.data.status ?? "PUBLISHED",
          tags: {
            create: parsed.data.tagIds.map((tagId) => ({ tagId })),
          },
        } as any,
        include: { tags: { include: { tag: true } } },
      });

      res.status(201).json(artwork);
    } catch {
      res.status(500).json({ error: "Failed to create artwork" });
    }
  },
);

// PUT /api/admin/artworks/:id
router.put(
  "/:id",
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      const parsed = artworkSchema.partial().safeParse({
        ...req.body,
        isFeatured: req.body.isFeatured === "true",
        isPublished: req.body.isPublished === "true",
        tagIds: req.body.tagIds ? JSON.parse(req.body.tagIds) : undefined,
      });

      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }

      let imageUrl: string | undefined;

      // If new image uploaded, compress and replace
      if (req.file) {
        const finalBuffer = await compressImage(req.file.buffer);
        const slug = await uniqueSlug(
          parsed.data.title || "artwork",
          "artwork",
        );
        const fileName = `${slug}-${Date.now()}.webp`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, finalBuffer, {
            contentType: "image/webp",
            upsert: false,
          });

        if (uploadError) {
          res.status(500).json({ error: "Failed to upload image" });
          return;
        }

        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(fileName);
        imageUrl = urlData.publicUrl;
      }

      // Update tags — delete existing and recreate
      if (parsed.data.tagIds) {
        await prisma.artworkTag.deleteMany({
          where: { artworkId: req.params.id as string },
        });
      }

      const artwork = await prisma.artwork.update({
        where: { id: req.params.id as string },
        data: {
          ...(parsed.data.title && { title: parsed.data.title }),
          ...(parsed.data.content !== undefined && {
            content: parsed.data.content,
          }),
          ...(imageUrl && { imageUrl }),
          ...(parsed.data.isFeatured !== undefined && {
            isFeatured: parsed.data.isFeatured,
          }),
          ...(parsed.data.isPublished !== undefined && {
            isPublished: parsed.data.isPublished,
          }),
          ...(parsed.data.creatorName !== undefined && {
            creatorName: parsed.data.creatorName,
          }),
          ...(parsed.data.status && { status: parsed.data.status }),
          ...(parsed.data.tagIds && {
            tags: {
              create: parsed.data.tagIds.map((tagId) => ({ tagId })),
            },
          }),
        } as any,
        include: { tags: true },
      });

      res.json(artwork);
    } catch {
      res.status(500).json({ error: "Failed to update artwork" });
    }
  },
);

// DELETE /api/admin/artworks/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const artwork = await prisma.artwork.findUnique({
      where: { id: req.params.id as string },
    });

    if (!artwork) {
      res.status(404).json({ error: "Artwork not found" });
      return;
    }

    // Delete image from Supabase Storage
    const fileName = artwork.imageUrl.split("/").pop()!;
    await supabase.storage.from(bucket).remove([fileName]);

    await prisma.artwork.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete artwork" });
  }
});

export default router;
