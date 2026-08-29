import { createFileRoute } from "@tanstack/react-router";
import {
  cleanUsername,
  hashPassword,
  json,
  publicProfile,
} from "@/lib/livecall.server";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const body = (await request.json()) as Record<string, unknown>;
        const username = cleanUsername(body["username"]);
        const password = String(body["password"] ?? "");
        if (!username || !password) {
          return json({ error: "Username and password are required." }, 400);
        }

        const { data: user } = await supabaseAdmin
          .from("app_users")
          .select("*")
          .eq("username", username)
          .maybeSingle();

        if (!user) {
          return json({ error: "Account not found. Please register first." }, 401);
        }
        if (user.password_hash !== (await hashPassword(password))) {
          return json({ error: "Incorrect password. Please try again." }, 401);
        }

        return json({
          success: true,
          message: "Login successful.",
          user: publicProfile(user),
        });
      },
    },
  },
});
