import slugifyLib from "slugify";
import prisma from "./prisma";

export function createSlug(text: string): string {
  return slugifyLib(text, {
    lower: true,
    strict: true,
    trim: true,
  });
}

// Ensures slug is unique per model by appending a suffix if needed
export async function uniqueSlug(
  text: string,
  model: "video" | "artwork" | "tag",
): Promise<string> {
  const base = createSlug(text);
  let slug = base;
  let count = 1;

  while (true) {
    const existing = await (prisma[model] as any).findUnique({
      where: { slug },
    });
    if (!existing) break;
    slug = `${base}-${count}`;
    count++;
  }

  return slug;
}
