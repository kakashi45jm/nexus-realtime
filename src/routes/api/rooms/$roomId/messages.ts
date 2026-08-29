import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/livecall.server";

export const Route = createFileRoute("/api/rooms/$roomId/messages")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data } = await supabaseAdmin
          .from("room_messages")
          .select("payload")
          .eq("room_id", params.roomId)
          .order("created_at", { ascending: true })
          .limit(300);
        return json({ messages: (data ?? []).map((row) => row.payload) });
      },
      POST: async ({ params, request }) => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const body = (await request.json()) as Record<string, any>;
        const message = body["message"];
        if (!message?.id) return json({ error: "message is required" }, 400);
        await supabaseAdmin.from("room_messages").upsert({
          id: message.id,
          room_id: params.roomId,
          sender_id: String(message.senderId ?? "unknown"),
          payload: message,
        });
        return json({ success: true });
      },
      DELETE: async ({ params }) => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        await supabaseAdmin
          .from("room_messages")
          .delete()
          .eq("room_id", params.roomId);
        return json({ success: true });
      },
    },
  },
});
