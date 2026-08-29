import { createFileRoute } from "@tanstack/react-router";
import { dmKey, json } from "@/lib/livecall.server";

export const Route = createFileRoute("/api/dms/$partnerId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const userId = new URL(request.url).searchParams.get("userId");
        if (!userId) return json({ error: "userId is required" }, 400);
        const { data } = await supabaseAdmin
          .from("dm_messages")
          .select("payload")
          .eq("dm_key", dmKey(userId, params.partnerId))
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
        if (!message?.id || !message?.senderId) {
          return json({ error: "message is required" }, 400);
        }
        await supabaseAdmin.from("dm_messages").upsert({
          id: message.id,
          dm_key: dmKey(String(message.senderId), params.partnerId),
          sender_id: String(message.senderId),
          recipient_id: params.partnerId,
          payload: message,
        });
        return json({ success: true });
      },
    },
  },
});
