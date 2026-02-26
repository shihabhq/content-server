import { Router, Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { uniqueSlug } from "../../lib/slugify.js";
import { z } from "zod";

const router = Router();

const tagSchema = z.object({
  name: z.string().min(1).max(50),
});

// GET /api/admin/tags
router.get("/", async (_req: Request, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { videos: true, artworks: true } },
      },
    });
    res.json(tags);
  } catch {
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

// POST /api/admin/tags
router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = tagSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const slug = await uniqueSlug(parsed.data.name, "tag");

    const tag = await prisma.tag.create({
      data: { name: parsed.data.name, slug },
    });

    res.status(201).json(tag);
  } catch {
    res.status(500).json({ error: "Failed to create tag" });
  }
});

// PUT /api/admin/tags/:id
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const parsed = tagSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const tag = await prisma.tag.update({
      where: { id: req.params.id as string },
      data: { name: parsed.data.name },
    });

    res.json(tag);
  } catch {
    res.status(500).json({ error: "Failed to update tag" });
  }
});

// DELETE /api/admin/tags/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.tag.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete tag" });
  }
});

export default router;
