import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma";

const router = Router();

// GET /api/videos
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 12;
    const featured = req.query.featured === "true";
    const recommended = req.query.recommended === "true";
    const sort = (req.query.sort as string) || "recent";
    const tag = req.query.tag as string | undefined;

    const where: any = {};
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
      where: { slug: req.params.slug as string },
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
      where: { slug: req.params.slug as string },
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
        where: { id: { notIn: existingIds } },
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
      where: { slug: req.params.slug as string },
      data: { viewCount: { increment: 1 } },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to update view count" });
  }
});

export default router;
