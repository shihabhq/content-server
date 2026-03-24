import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { uniqueSlug } from "../../lib/slugify.js";
import { z } from "zod";

const router = Router();

const videoSchema = z.object({
  title: z.string().min(1).max(200),
  youtubeUrl: z.string().url(),
  description: z.string().optional(),
  thumbnail: z.string().optional(),
  isFeatured: z.boolean().optional().default(false),
  isRecommended: z.boolean().optional().default(false),
  tagIds: z.array(z.string()).optional().default([]),
  creatorName: z.string().optional(),
  status: z.enum(["PUBLISHED", "PENDING"]).optional(),
});

function extractYoutubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// GET /api/admin/videos
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const status = req.query.status as "PUBLISHED" | "PENDING" | undefined;

    const where: any = {};
    if (status) where.status = status;

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { tags: { include: { tag: true } } },
      }),
      prisma.video.count({ where }),
    ]);

    res.json({ data: videos, total, page, pageSize });
  } catch {
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

// GET /api/admin/videos/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const video = await prisma.video.findUnique({
      where: { id: req.params.id as string },
      include: { tags: { include: { tag: true } } },
    });

    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    res.json(video);
  } catch {
    res.status(500).json({ error: "Failed to fetch video" });
  }
});

// POST /api/admin/videos
router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = videoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const youtubeId = extractYoutubeId(parsed.data.youtubeUrl);
    if (!youtubeId) {
      res.status(400).json({ error: "Invalid YouTube URL" });
      return;
    }

    const slug = await uniqueSlug(parsed.data.title, "video");

    const video = await prisma.video.create({
      data: {
        title: parsed.data.title,
        slug,
        youtubeUrl: parsed.data.youtubeUrl,
        youtubeId,
        description: parsed.data.description,
        thumbnail: parsed.data.thumbnail,
        isFeatured: parsed.data.isFeatured,
        isRecommended: parsed.data.isRecommended,
        creatorName: parsed.data.creatorName,
        status: parsed.data.status ?? "PUBLISHED",
        tags: {
          create: parsed.data.tagIds.map((tagId) => ({ tagId })),
        },
      },
      include: { tags: { include: { tag: true } } },
    });

    res.status(201).json(video);
  } catch {
    res.status(500).json({ error: "Failed to create video" });
  }
});

// PUT /api/admin/videos/:id
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const parsed = videoSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    let youtubeId: string | undefined;
    if (parsed.data.youtubeUrl) {
      const extracted = extractYoutubeId(parsed.data.youtubeUrl);
      if (!extracted) {
        res.status(400).json({ error: "Invalid YouTube URL" });
        return;
      }
      youtubeId = extracted;
    }

    // Update tags — delete existing and recreate
    if (parsed.data.tagIds) {
      await prisma.videoTag.deleteMany({ where: { videoId: req.params.id as string } });
    }

    const video = await prisma.video.update({
      where: { id: req.params.id as string },
      data: {
        ...(parsed.data.title && { title: parsed.data.title }),
        ...(parsed.data.youtubeUrl && { youtubeUrl: parsed.data.youtubeUrl }),
        ...(youtubeId && { youtubeId }),
        ...(parsed.data.creatorName !== undefined && {
          creatorName: parsed.data.creatorName,
        }),
        ...(parsed.data.status && { status: parsed.data.status }),
        ...(parsed.data.description !== undefined && {
          description: parsed.data.description,
        }),
        ...(parsed.data.thumbnail !== undefined && {
          thumbnail: parsed.data.thumbnail,
        }),
        ...(parsed.data.isFeatured !== undefined && {
          isFeatured: parsed.data.isFeatured,
        }),
        ...(parsed.data.isRecommended !== undefined && {
          isRecommended: parsed.data.isRecommended,
        }),
        ...(parsed.data.tagIds && {
          tags: {
            create: parsed.data.tagIds.map((tagId) => ({ tagId })),
          },
        }),
      },
      include: { tags: { include: { tag: true } } },
    });

    res.json(video);
  } catch {
    res.status(500).json({ error: "Failed to update video" });
  }
});

// DELETE /api/admin/videos/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.video.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete video" });
  }
});

export default router;
