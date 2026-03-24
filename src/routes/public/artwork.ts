import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { upload } from "../../middleware/upload.js";
import { supabase } from "../../lib/supabase.js";
import { uniqueSlug } from "../../lib/slugify.js";
import { z } from "zod";
import sharp from "sharp";

const router = Router();
const bucket = process.env.SUPABASE_BUCKET!;

const publicArtworkSubmitSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().optional(),
  creatorName: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
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

// GET /api/artworks
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 12;
    const featured = req.query.featured === "true";
    const tag = req.query.tag as string | undefined;
    const sort = (req.query.sort as string) || "recent";

    const where: any = { status: "PUBLISHED", isPublished: true };
    if (featured) where.isFeatured = true;
    if (tag) where.tags = { some: { tag: { slug: tag } } };

    const orderBy =
      sort === "popular"
        ? { createdAt: "desc" as const }
        : { createdAt: "desc" as const };

    const [artworks, total] = await Promise.all([
      prisma.artwork.findMany({
        where,
        orderBy,
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

// GET /api/artworks/:slug
router.get("/:slug", async (req: Request, res: Response) => {
  try {
    const publishedWhere: any = {
      slug: req.params.slug as string,
      status: "PUBLISHED",
      isPublished: true,
    };
    const artwork = await prisma.artwork.findFirst({
      where: publishedWhere,
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

// GET /api/artworks/:slug/suggestions
router.get("/:slug/suggestions", async (req: Request, res: Response) => {
  try {
    const publishedWhere: any = {
      slug: req.params.slug as string,
      status: "PUBLISHED",
      isPublished: true,
    };
    const current = await prisma.artwork.findFirst({
      where: publishedWhere,
      include: { tags: { include: { tag: true } } },
    });

    if (!current) {
      res.status(404).json({ error: "Artwork not found" });
      return;
    }

    const tagIds = current.tags.map((t) => t.tagId);

    const suggestionsWhere: any = {
      id: { not: current.id },
      status: "PUBLISHED",
      isPublished: true,
      ...(tagIds.length > 0 && {
        tags: { some: { tagId: { in: tagIds } } },
      }),
    };

    const suggestions = await prisma.artwork.findMany({
      where: suggestionsWhere,
      include: { tags: { include: { tag: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    });

    if (suggestions.length < 6) {
      const existingIds = [current.id, ...suggestions.map((a) => a.id)];
      const fillerWhere: any = {
        id: { notIn: existingIds },
        status: "PUBLISHED",
        isPublished: true,
      };
      const filler = await prisma.artwork.findMany({
        where: fillerWhere,
        orderBy: { createdAt: "desc" },
        take: 6 - suggestions.length,
        include: { tags: { include: { tag: true } } },
      });
      suggestions.push(...filler);
    }

    res.json(suggestions);
  } catch {
    res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

// POST /api/artworks/submit
router.post(
  "/submit",
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Image file is required" });
        return;
      }

      const parsed = publicArtworkSubmitSchema.safeParse({
        title: req.body.title,
        content: req.body.content,
        creatorName: req.body.creatorName,
        tags: req.body.tags ? JSON.parse(req.body.tags) : [],
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

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);

      const names = parsed.data.tags.map((n) => n.trim()).filter(Boolean);
      const existing = await prisma.tag.findMany({
        where: { name: { in: names } },
      });
      const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t]));
      const tagIds: string[] = [];

      for (const name of names) {
        const key = name.toLowerCase();
        let tag = byName.get(key);
        if (!tag) {
          tag = await prisma.tag.create({
            data: {
              name,
              slug: name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, ""),
            },
          });
          byName.set(key, tag);
        }
        tagIds.push(tag.id);
      }

      await prisma.artwork.create({
        data: {
          title: parsed.data.title,
          slug,
          content: parsed.data.content,
          imageUrl: urlData.publicUrl,
          creatorName: parsed.data.creatorName,
          status: "PENDING",
          isPublished: false,
          isFeatured: false,
          tags: {
            create: tagIds.map((tagId) => ({ tagId })),
          },
        } as any,
      });

      res.status(201).json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to submit artwork" });
    }
  },
);

export default router;
