import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/livecall.server";

export const Route = createFileRoute("/api/rooms/")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data } = await supabaseAdmin
          .from("rooms")
          .select("*")
          .order("created_at", { ascending: true });
        return json({
          rooms: (data ?? []).map((room) => ({
            id: room.id,
            name: room.name,
            createdAt: new Date(room.created_at).getTime(),
          })),
        });
      },
    },
  },
});
