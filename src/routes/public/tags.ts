import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma.js";

const router = Router();

// GET /api/tags
router.get("/", async (_req: Request, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { videos: true, artworks: true },
        },
      },
    });
    res.json(tags);
  } catch {
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

// GET /api/tags/:slug
router.get("/:slug", async (req: Request, res: Response) => {
  try {
    const tag = await prisma.tag.findUnique({
      where: { slug: req.params.slug as string },
      include: {
        _count: {
          select: { videos: true, artworks: true },
        },
      },
    });

    if (!tag) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    res.json(tag);
  } catch {
    res.status(500).json({ error: "Failed to fetch tag" });
  }
});

export default router;
