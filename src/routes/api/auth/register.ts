import { createFileRoute } from "@tanstack/react-router";
import {
  cleanUsername,
  hashPassword,
  json,
  newId,
  publicProfile,
} from "@/lib/livecall.server";

const COLORS = ["#ec4899", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#06b6d4"];

export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const body = (await request.json()) as Record<string, unknown>;
        const username = cleanUsername(body["username"]);
        const password = String(body["password"] ?? "");

        if (!username) return json({ error: "Username is required." }, 400);
        if (password.length < 4) {
          return json({ error: "Password must be at least 4 characters." }, 400);
        }

        const { data: existing } = await supabaseAdmin
          .from("app_users")
          .select("id")
          .eq("username", username)
          .maybeSingle();
        if (existing) {
          return json(
            {
              error:
                "Username is already taken. Please choose another or sign in.",
            },
            409,
          );
        }

        const displayName =
          String(body["name"] ?? "").trim() || String(body["username"] ?? "").trim();
        const id = newId("usr");
        const profile = {
          name: displayName,
          handle: `@${username}`,
          avatarColor:
            (body["avatarColor"] as string) ||
            COLORS[Math.floor(Math.random() * COLORS.length)]!,
          isAdmin: false,
          isVerified: false,
          isVip: false,
          statusMessage: "Available on LiveCall",
          customStatusEmoji: "🟢",
          bio: "Member of Pink Void LiveCall & Web Chat.",
          preferredLanguage: "English",
          autoTranslate: true,
          createdAt: Date.now(),
        };

        const { error } = await supabaseAdmin.from("app_users").insert({
          id,
          username,
          password_hash: await hashPassword(password),
          profile,
        });
        if (error) return json({ error: "Failed to create account." }, 500);

        return json({
          success: true,
          message: "Account created successfully and saved to database.",
          user: publicProfile({ id, username, profile }),
        });
      },
    },
  },
});
