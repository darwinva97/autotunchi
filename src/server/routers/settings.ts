import { z } from "zod";
import { router, protectedProcedure } from "@/lib/trpc/init";
import { encrypt } from "@/lib/crypto";
import { validateCloudflareToken } from "@/lib/cloudflare/dns";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const settingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.user.id!),
      columns: {
        id: true,
        name: true,
        email: true,
        githubUsername: true,
        cloudflareZone: true,
        cloudflareToken: true,
      },
    });

    return {
      ...user,
      hasCloudflareToken: !!user?.cloudflareToken,
      cloudflareToken: undefined,
    };
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(users)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(users.id, ctx.user.id!))
        .returning();

      return updated;
    }),

  validateCloudflare: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      return validateCloudflareToken(input.token);
    }),

  updateCloudflare: protectedProcedure
    .input(
      z.object({
        token: z.string().optional(),
        zoneId: z.string().optional(),
        remove: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.remove) {
        await ctx.db
          .update(users)
          .set({
            cloudflareToken: null,
            cloudflareZone: null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, ctx.user.id!));

        return { success: true };
      }

      const data: {
        cloudflareToken?: string;
        cloudflareZone?: string;
        updatedAt: Date;
      } = { updatedAt: new Date() };

      if (input.token) {
        // Validate token first
        const validation = await validateCloudflareToken(input.token);
        if (!validation.valid) {
          throw new Error("Invalid Cloudflare token");
        }
        data.cloudflareToken = encrypt(input.token);
      }

      if (input.zoneId) {
        data.cloudflareZone = input.zoneId;
      }

      await ctx.db
        .update(users)
        .set(data)
        .where(eq(users.id, ctx.user.id!));

      return { success: true };
    }),
});
