import { defineCollection, z } from 'astro:content';

const challenges = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    contest: z.string(),        // sekai, idek, htb
    category: z.string(),      // web, crypto, pwn, rev, forensics, misc
    difficulty: z.enum(['Easy', 'Medium', 'Hard']),
    points: z.number(),
    tags: z.array(z.string()),
    publishedAt: z.date(),
    solved: z.boolean().default(false),
  }),
});

export const collections = {
  challenges,
};