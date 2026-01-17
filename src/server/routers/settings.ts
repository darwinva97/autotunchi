import { z } from "zod";
import { router, protectedProcedure } from "@/lib/trpc/init";
import { encrypt } from "@/lib/crypto";
import { validateCloudflareToken } from "@/lib/cloudflare/dns";

export const settingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        githubUsername: true,
        cloudflareZone: true,
        // Don't expose the actual token
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
      return ctx.db.user.update({
        where: { id: ctx.user.id },
        data: input,
      });
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
        await ctx.db.user.update({
          where: { id: ctx.user.id },
          data: {
            cloudflareToken: null,
            cloudflareZone: null,
          },
        });
        return { success: true };
      }

      const data: { cloudflareToken?: string; cloudflareZone?: string } = {};

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

      await ctx.db.user.update({
        where: { id: ctx.user.id },
        data,
      });

      return { success: true };
    }),
});
