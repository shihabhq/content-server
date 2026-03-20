import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { uniqueSlug } from "../../lib/slugify.js";
import { z } from "zod";

const router = Router();

const publicSubmitSchema = z.object({
  title: z.string().min(1).max(200),
  youtubeUrl: z.string().url(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  creatorName: z.string().optional(),
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

// GET /api/videos
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 12;
    const featured = req.query.featured === "true";
    const recommended = req.query.recommended === "true";
    const sort = (req.query.sort as string) || "recent";
    const tag = req.query.tag as string | undefined;

    const where: any = { status: "PUBLISHED" };
    if (featured) where.isFeatured = true;
    if (recommended) where.isRecommended = true;
    if (tag) where.tags = { some: { tag: { slug: tag } } };

    const orderBy =
      sort === "popular"
        ? { viewCount: "desc" as const }
        : { publishedAt: "desc" as const };

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where,
        orderBy,
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

// GET /api/videos/:slug
router.get("/:slug", async (req: Request, res: Response) => {
  try {
    const video = await prisma.video.findUnique({
      where: {
        slug: req.params.slug as string,
        status: "PUBLISHED",
      },
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

// GET /api/videos/:slug/suggestions
router.get("/:slug/suggestions", async (req: Request, res: Response) => {
  try {
    const current = await prisma.video.findUnique({
      where: {
        slug: req.params.slug as string,
        status: "PUBLISHED",
      },
      include: { tags: true },
    });

    if (!current) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const tagIds = current.tags.map((t) => t.tagId);

    const suggestions = await prisma.video.findMany({
      where: {
        id: { not: current.id },
        ...(tagIds.length > 0 && {
          tags: { some: { tagId: { in: tagIds } } },
        }),
      },
      include: { tags: { include: { tag: true } } },
      orderBy: { viewCount: "desc" },
      take: 6,
    });

    // Fill with recent if not enough
    if (suggestions.length < 6) {
      const existingIds = [current.id, ...suggestions.map((v) => v.id)];
      const filler = await prisma.video.findMany({
        where: { id: { notIn: existingIds }, status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
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

// POST /api/videos/:slug/view
router.post("/:slug/view", async (req: Request, res: Response) => {
  try {
    await prisma.video.update({
      where: { slug: req.params.slug as string, status: "PUBLISHED" },
      data: { viewCount: { increment: 1 } },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to update view count" });
  }
});

// POST /api/videos/submit
router.post("/submit", async (req: Request, res: Response) => {
  try {
    const parsed = publicSubmitSchema.safeParse(req.body);
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

    // Resolve tag names to IDs, creating missing tags
    const names = parsed.data.tags.map((n) => n.trim()).filter(Boolean);
    let tagIds: string[] = [];
    if (names.length > 0) {
      const existing = await prisma.tag.findMany({
        where: { name: { in: names } },
      });
      const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t]));
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
    }

    await prisma.video.create({
      data: {
        title: parsed.data.title,
        slug,
        youtubeUrl: parsed.data.youtubeUrl,
        youtubeId,
        description: parsed.data.description,
        creatorName: parsed.data.creatorName,
        status: "PENDING",
        isFeatured: false,
        isRecommended: false,
        tags: {
          create: tagIds.map((tagId) => ({ tagId })),
        },
      },
    });

    res.status(201).json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to submit video" });
  }
});

export default router;
