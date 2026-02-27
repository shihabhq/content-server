import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma.js";

const router = Router();

// GET /api/artworks
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 12;
    const featured = req.query.featured === "true";
    const tag = req.query.tag as string | undefined;
    const sort = (req.query.sort as string) || "recent";

    const where: any = {};
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
    const artwork = await prisma.artwork.findUnique({
      where: { slug: req.params.slug as string },
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
    const current = await prisma.artwork.findUnique({
      where: { slug: req.params.slug as string },
      include: { tags: { include: { tag: true } } },
    });

    if (!current) {
      res.status(404).json({ error: "Artwork not found" });
      return;
    }

    const tagIds = current.tags.map((t) => t.tagId);

    const suggestions = await prisma.artwork.findMany({
      where: {
        id: { not: current.id },
        ...(tagIds.length > 0 && {
          tags: { some: { tagId: { in: tagIds } } },
        }),
      },
      include: { tags: { include: { tag: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    });

    if (suggestions.length < 6) {
      const existingIds = [current.id, ...suggestions.map((a) => a.id)];
      const filler = await prisma.artwork.findMany({
        where: { id: { notIn: existingIds } },
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

export default router;
