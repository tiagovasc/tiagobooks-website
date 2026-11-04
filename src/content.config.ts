import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Frontmatter mirrors what Pika exports (title, date, slug, tags) plus the few
// features actually used on the live blog: drafts, password-protected entries.
const shared = {
  title: z.string(),
  // Publish datetime (UTC or with offset). Pages may omit it.
  date: z.coerce.date().optional(),
  updated: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
  // Hidden from lists, feed, sitemap, search. Still reachable by URL.
  unlisted: z.boolean().default(false),
  // Encrypted at build time with SITE_PASSWORD (see src/lib/protect.ts).
  protected: z.boolean().default(false),
  // Old URL paths that should 301 to this entry (Pika "aliases" equivalent).
  aliases: z.array(z.string()).default([]),
  description: z.string().optional(),
  // Optional explicit social preview image (path or URL).
  image: z.string().optional(),
  // Frontend-only thumbnail framing; original images and article figures stay intact.
  thumbnailCrop: z.object({
    x: z.number().min(0).max(100).default(50),
    y: z.number().min(0).max(100).default(50),
    zoom: z.number().min(1).max(3).default(1),
  }).optional(),
  // Public artwork credit; collection IDs, local paths and private notes stay outside Git.
  artwork: z.object({
    title: z.string(),
    artist: z.string(),
    year: z.string().optional(),
    source: z.string().url().optional(),
    alt: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    thumbnail: z.string().optional(),
  }).optional(),
};

export const collections = {
  posts: defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
    schema: z.object({ ...shared, date: z.coerce.date() }),
  }),
  pages: defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/pages' }),
    schema: z.object(shared),
  }),
};
