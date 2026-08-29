import { createFileRoute } from "@tanstack/react-router";
import {
  cleanUsername,
  json,
  newId,
  publicProfile,
} from "@/lib/livecall.server";

export const Route = createFileRoute("/api/auth/update-profile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const body = (await request.json()) as Record<string, any>;
        const updates = (body["updates"] ?? {}) as Record<string, unknown>;
        if (!updates || typeof updates !== "object") {
          return json({ error: "Updates are required." }, 400);
        }

        const username = cleanUsername(
          body["username"] ?? updates["username"] ?? updates["handle"] ?? "",
        );
        const targetId = (body["userId"] ?? updates["id"]) as string | undefined;

        let existing = null as any;
        if (username) {
          const { data } = await supabaseAdmin
            .from("app_users")
            .select("*")
            .eq("username", username)
            .maybeSingle();
          existing = data;
        }
        if (!existing && targetId) {
          const { data } = await supabaseAdmin
            .from("app_users")
            .select("*")
            .eq("id", targetId)
            .maybeSingle();
          existing = data;
        }

        if (existing) {
          const merged = {
            ...(typeof existing.profile === "object" && existing.profile
              ? existing.profile
              : {}),
            ...updates,
          } as Record<string, unknown>;
          delete merged["id"];
          const { error } = await supabaseAdmin
            .from("app_users")
            .update({ profile: merged as never, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
          if (error) return json({ error: "Failed to update profile." }, 500);
          return json({
            success: true,
            user: publicProfile({
              id: existing.id,
              username: existing.username,
              profile: merged,
            }),
          });
        }

        const fallbackUsername = username || `user_${Date.now()}`;
        const id = targetId || newId("usr");
        const profile = {
          name: updates["name"] ?? fallbackUsername,
          handle: updates["handle"] ?? `@${fallbackUsername}`,
          avatarColor: updates["avatarColor"] ?? "#ec4899",
          statusMessage: updates["statusMessage"] ?? "Available on LiveCall",
          customStatusEmoji: updates["customStatusEmoji"] ?? "🟢",
          bio: updates["bio"] ?? "Member of Pink Void LiveCall & Web Chat.",
          preferredLanguage: updates["preferredLanguage"] ?? "English",
          autoTranslate: updates["autoTranslate"] ?? true,
          ...updates,
          createdAt: Date.now(),
        } as Record<string, unknown>;
        delete profile["id"];

        const { error } = await supabaseAdmin.from("app_users").upsert({
          id,
          username: fallbackUsername,
          password_hash: "",
          profile: profile as never,
        });
        if (error) return json({ error: "Failed to update profile." }, 500);

        return json({
          success: true,
          user: publicProfile({ id, username: fallbackUsername, profile }),
        });
      },
    },
  },
});
