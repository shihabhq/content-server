import prisma from "../src/lib/prisma.js";
import { uniqueSlug } from "../src/lib/slugify.js";

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "");
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
  } catch (e) {}
  const m = url.match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

function titleFromImageUrl(url: string): string {
  try {
    const u = new URL(url);
    const name = u.pathname.split("/").pop() || "artwork";
    return name.replace(/[-_]/g, " ").replace(/\.[a-z0-9]+$/i, "");
  } catch (e) {
    return "Artwork";
  }
}

async function main() {
  const videoUrls = [
    "https://youtu.be/Bt_Db7SW_CM?si=vBFkFEQJ0uOmCqji",
    "https://youtu.be/lqH8bqObMqE?si=Mk5slhyHwrLQSZTQ",
    "https://youtu.be/P11VhLmYPvI?si=CCio_10HoSNeS6hn",
    "https://youtu.be/70LNrei3vQw?si=H52nrvpijCMqMx9_",
    "https://youtu.be/eICp03rrgp0?si=58vt-6heTqKrdZi6",
    "https://youtu.be/SJXvSB_xKOk?si=7Ae-Ra7plLk_ToMw",
  ];

  const artworkUrls = [
    "https://media.istockphoto.com/id/1178017061/photo/woolly-mammoth-set-in-a-winter-scene-environment-16-9-panoramic-format.jpg?s=612x612&w=0&k=20&c=nYVvqx3LSYZjVjCCpb9qlVdnYXbb47jPAmEdW-Cf7VM=",
    "https://thumbs.dreamstime.com/b/high-resolution-image-ratio-ocean-landscape-detailed-foreground-rocks-sand-beach-landscape-wave-ocean-sunset-241603380.jpg",
    "https://w0.peakpx.com/wallpaper/99/683/HD-wallpaper-mountains-sunset-snow-winter-landscape-u-16-9-background.jpg",
    "https://media.istockphoto.com/id/1370838456/photo/ocean-sunset-earth-sea-sky-landscape-high-resolution-16-9-image-format.jpg?s=612x612&w=0&k=20&c=UEnoREzXWQ-Mb-KHqt81tlMmx5fZzXyp82TcuCalRmk=",
    "https://thumbs.dreamstime.com/b/sea-%E2%80%8B%E2%80%8Bsurface-pattern-aerial-view-photo-planktons-top-turquoise-ocean-elements-image-furnished-nasa-space-244823304.jpg",
  ];

  // Seed videos (fetch oEmbed to get actual titles/thumbnails)
  for (let i = 0; i < videoUrls.length; i++) {
    const url = videoUrls[i];
    const youtubeId = extractYouTubeId(url) || `unknown-${i}`;

    // try fetching oEmbed data for real title/thumbnail
    let title = `Seed Video ${i + 1} (${youtubeId})`;
    let thumbnail: string | null = null;
    let description: string | null = null;
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.title) title = String(data.title);
        if (data.thumbnail_url) thumbnail = String(data.thumbnail_url);
        if (data.author_name) description = `By ${String(data.author_name)}`;
      }
    } catch (e) {
      // ignore fetch failures and fall back to generated title
    }

    const slug = await uniqueSlug(title, "video");

    await prisma.video.upsert({
      where: { slug },
      create: {
        title,
        slug,
        youtubeUrl: url,
        youtubeId,
        description,
        thumbnail,
        isFeatured:true,
        isRecommended:true,
      },
      update: {
        title,
        youtubeUrl: url,
        youtubeId,
        description,
        thumbnail,
        isFeatured: true,
        isRecommended: true,
      },
    });
  }

  // Mark all existing videos as featured and recommended so /api/videos?featured=true and ?recommended=true return them (you can unmark in admin)
  await prisma.video.updateMany({
    data: { isFeatured: true, isRecommended: true },
  });

  // Seed artworks
  for (let i = 0; i < artworkUrls.length; i++) {
    const url = artworkUrls[i];
    const baseTitle = titleFromImageUrl(url);
    // use a clean human title
    const title = baseTitle
      .split(" ")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
    const slug = await uniqueSlug(title, "artwork");

    await prisma.artwork.upsert({
      where: { slug },
      create: {
        title,
        slug,
        content: null,
        imageUrl: url,
        isPublished: true,
        isFeatured: true,
      },
      update: {
        title,
        imageUrl: url,
        isFeatured: true,
      },
    });
  }

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
