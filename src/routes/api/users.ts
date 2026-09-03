import { createFileRoute } from "@tanstack/react-router";
import { json, publicProfile } from "@/lib/livecall.server";

export const Route = createFileRoute("/api/users")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data } = await supabaseAdmin
          .from("app_users")
          .select("id, username, profile")
          .limit(500);
        return json({
          users: (data ?? []).map((row) => {
            const p = publicProfile(row as any) as Record<string, unknown>;
            return {
              id: p["id"],
              username: p["username"],
              name: p["name"] ?? p["username"],
              handle: p["handle"] ?? `@${p["username"]}`,
              avatarColor: p["avatarColor"] ?? "#ec4899",
              isAdmin: !!p["isAdmin"],
              isVerified: !!p["isVerified"],
              isVip: !!p["isVip"],
            };
          }),
        });
      },
    },
  },
});
