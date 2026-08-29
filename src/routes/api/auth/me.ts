import { createFileRoute } from "@tanstack/react-router";
import { cleanUsername, json, publicProfile } from "@/lib/livecall.server";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        const username = url.searchParams.get("username");
        const handle = url.searchParams.get("handle");

        for (const name of [username, handle]) {
          if (!name) continue;
          const { data } = await supabaseAdmin
            .from("app_users")
            .select("*")
            .eq("username", cleanUsername(name))
            .maybeSingle();
          if (data) return json({ success: true, user: publicProfile(data) });
        }

        if (id) {
          const { data } = await supabaseAdmin
            .from("app_users")
            .select("*")
            .eq("id", id)
            .maybeSingle();
          if (data) return json({ success: true, user: publicProfile(data) });
        }

        return json({ error: "User not found in database." }, 404);
      },
    },
  },
});
