/**
 * Drop-in replacement for the original `new WebSocket('/ws')` connection.
 *
 * The original app talked to an Express + ws server. This class keeps the exact
 * same message protocol but implements it on top of Lovable Cloud realtime
 * (broadcast + presence) plus the /api routes for permanent history.
 */
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMsg = any;

const GLOBAL_TOPIC = "livecall-global";

export class RealtimeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = 0;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((err?: unknown) => void) | null = null;

  private globalChannel: RealtimeChannel | null = null;
  private roomChannel: RealtimeChannel | null = null;
  private userChannel: RealtimeChannel | null = null;
  private user: AnyMsg | null = null;
  private roomId: string | null = null;
  private roomParticipants = new Map<string, AnyMsg>();
  private closed = false;

  constructor() {
    // Connect the global channel immediately; "open" fires once it is joined.
    this.globalChannel = supabase.channel(GLOBAL_TOPIC, {
      config: { broadcast: { self: false }, presence: { key: "" } },
    });

    this.globalChannel
      .on("broadcast", { event: "msg" }, ({ payload }) => {
        this.emit(payload as AnyMsg);
      })
      .on("presence", { event: "sync" }, () => {
        const state = this.globalChannel?.presenceState() ?? {};
        for (const entries of Object.values(state)) {
          for (const entry of entries as unknown as AnyMsg[]) {
            if (entry?.user && entry.user.id !== this.user?.id) {
              this.emit({ type: "user_updated", user: entry.user });
            }
          }
        }
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        for (const entry of leftPresences as unknown as AnyMsg[]) {
          if (entry?.user?.id) {
            this.emit({ type: "user_left", userId: entry.user.id });
          }
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          this.readyState = 1;
          this.onopen?.();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          this.onerror?.(status);
        } else if (status === "CLOSED" && !this.closed) {
          this.readyState = 3;
          this.onclose?.();
        }
      });
  }

  private emit(msg: AnyMsg) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  private broadcast(channel: RealtimeChannel | null, payload: AnyMsg) {
    if (!channel) return;
    void channel.send({ type: "broadcast", event: "msg", payload });
  }

  private toUser(userId: string, payload: AnyMsg) {
    if (userId === this.user?.id) {
      this.emit(payload);
      return;
    }
    void supabase.channel(`livecall-user-${userId}`).send({
      type: "broadcast",
      event: "msg",
      payload,
    });
  }

  private sysMessage(roomId: string, text: string, color = "#64748b") {
    return {
      id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      roomId,
      senderId: "system",
      senderName: "System",
      senderAvatarColor: color,
      text,
      timestamp: Date.now(),
      isSystem: true,
    };
  }

  send(raw: string) {
    let msg: AnyMsg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    void this.handle(msg);
  }

  private async handle(msg: AnyMsg) {
    switch (msg.type) {
      case "ping":
        this.emit({ type: "pong" });
        return;

      case "join_room":
        await this.joinRoom(msg.roomId, msg.user);
        return;

      case "leave_room": {
        if (this.roomChannel) {
          this.broadcast(this.roomChannel, {
            type: "user_left",
            userId: this.user?.id,
          });
          await supabase.removeChannel(this.roomChannel);
          this.roomChannel = null;
        }
        this.roomId = null;
        return;
      }

      case "user_updated": {
        this.user = msg.user;
        await this.globalChannel?.track({ user: msg.user });
        await this.roomChannel?.track({ user: msg.user });
        this.broadcast(this.globalChannel, { type: "user_updated", user: msg.user });
        this.emit({ type: "user_updated", user: msg.user });
        return;
      }

      case "chat_message": {
        const message = { ...msg.message, timestamp: Date.now() };
        const roomId = message.roomId || this.roomId;
        this.emit({ type: "chat_message", message });
        this.broadcast(this.roomChannel, { type: "chat_message", message });
        if (roomId) {
          await fetch(`/api/rooms/${encodeURIComponent(roomId)}/messages`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message }),
          }).catch(() => undefined);
        }
        return;
      }

      case "private_chat_message": {
        const message = { ...msg.message, isPrivate: true, timestamp: Date.now() };
        this.emit({ type: "private_chat_message", message });
        this.toUser(message.recipientId, { type: "private_chat_message", message });
        await fetch(`/api/dms/${encodeURIComponent(message.recipientId)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message }),
        }).catch(() => undefined);
        return;
      }

      case "get_private_history": {
        if (!this.user?.id || !msg.partnerId) return;
        const res = await fetch(
          `/api/dms/${encodeURIComponent(msg.partnerId)}?userId=${encodeURIComponent(this.user.id)}`,
        ).catch(() => null);
        const data = res && res.ok ? await res.json() : { messages: [] };
        this.emit({
          type: "private_history",
          partnerId: msg.partnerId,
          messages: data.messages ?? [],
        });
        return;
      }

      case "typing": {
        const payload = {
          type: "typing",
          userId: this.user?.id,
          userName: this.user?.name,
          isTyping: msg.isTyping,
          isPrivate: !!msg.isPrivate,
          targetUserId: msg.targetUserId,
        };
        if (msg.isPrivate && msg.targetUserId) this.toUser(msg.targetUserId, payload);
        else this.broadcast(this.roomChannel, payload);
        return;
      }

      case "admin_clear_chat": {
        const roomId = msg.roomId || this.roomId;
        if (!roomId) return;
        await fetch(`/api/rooms/${encodeURIComponent(roomId)}/messages`, {
          method: "DELETE",
        }).catch(() => undefined);
        const notice = { type: "admin_clear_chat", roomId, adminName: msg.adminName };
        const sys = this.sysMessage(
          roomId,
          `🧹 Room chat was cleared by Administrator ${msg.adminName || this.user?.name}`,
          "#ef4444",
        );
        this.emit(notice);
        this.emit({ type: "chat_message", message: sys });
        this.broadcast(this.roomChannel, notice);
        this.broadcast(this.roomChannel, { type: "chat_message", message: sys });
        return;
      }

      case "admin_broadcast": {
        const payload = {
          type: "admin_broadcast",
          announcement: msg.announcement,
          adminName: msg.adminName || this.user?.name,
        };
        this.emit(payload);
        this.broadcast(this.globalChannel, payload);
        if (this.roomId) {
          const sys = {
            ...this.sysMessage(this.roomId, `📢 ${msg.announcement}`, "#8b5cf6"),
            senderName: "📢 Official Announcement",
            isAnnouncement: true,
          };
          this.emit({ type: "chat_message", message: sys });
          this.broadcast(this.roomChannel, { type: "chat_message", message: sys });
        }
        return;
      }

      case "admin_kick_user": {
        if (!msg.targetUserId) return;
        this.toUser(msg.targetUserId, {
          type: "admin_kick_user",
          targetUserId: msg.targetUserId,
          targetUserName: msg.targetUserName || "User",
          adminName: msg.adminName || this.user?.name,
          reason: msg.reason || "Removed by Administrator",
        });
        const sys = this.sysMessage(
          this.roomId ?? "lobby",
          `⚠️ ${msg.targetUserName || "User"} was kicked by Administrator ${
            msg.adminName || this.user?.name
          }${msg.reason ? `: "${msg.reason}"` : ""}`,
          "#ef4444",
        );
        this.emit({ type: "user_left", userId: msg.targetUserId });
        this.emit({ type: "chat_message", message: sys });
        this.broadcast(this.roomChannel, { type: "user_left", userId: msg.targetUserId });
        this.broadcast(this.roomChannel, { type: "chat_message", message: sys });
        return;
      }

      case "admin_badge_update": {
        const payload = { type: "admin_badge_update", ...msg };
        this.broadcast(this.globalChannel, payload);
        this.emit(payload);
        return;
      }

      default: {
        // Call + WebRTC signaling and legacy media relay pass-through.
        const enriched = { ...msg, senderId: msg.senderId ?? this.user?.id };
        if (msg.type === "call_initiate" && msg.call?.isPrivate && msg.call?.recipientId) {
          this.toUser(msg.call.recipientId, {
            type: "call_initiate",
            call: {
              ...msg.call,
              status: "ringing",
              startedAt: Date.now(),
              participants: [this.user?.id],
            },
          });
          return;
        }
        if (msg.targetUserId) this.toUser(msg.targetUserId, enriched);
        else this.broadcast(this.roomChannel, enriched);
        return;
      }
    }
  }

  private async joinRoom(roomId: string, user: AnyMsg) {
    this.user = user;
    this.roomId = roomId;

    await this.globalChannel?.track({ user });

    if (!this.userChannel) {
      this.userChannel = supabase.channel(`livecall-user-${user.id}`, {
        config: { broadcast: { self: false } },
      });
      this.userChannel
        .on("broadcast", { event: "msg" }, ({ payload }) => this.emit(payload as AnyMsg))
        .subscribe();
    }

    if (this.roomChannel) {
      await supabase.removeChannel(this.roomChannel);
      this.roomChannel = null;
    }
    this.roomParticipants = new Map([[user.id, user]]);

    const channel = supabase.channel(`livecall-room-${roomId}`, {
      config: { broadcast: { self: false }, presence: { key: user.id } },
    });
    this.roomChannel = channel;

    channel
      .on("broadcast", { event: "msg" }, ({ payload }) => this.emit(payload as AnyMsg))
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const seen = new Set<string>();
        for (const entries of Object.values(state)) {
          for (const entry of entries as unknown as AnyMsg[]) {
            if (!entry?.user?.id) continue;
            seen.add(entry.user.id);
            if (!this.roomParticipants.has(entry.user.id)) {
              this.roomParticipants.set(entry.user.id, entry.user);
              this.emit({ type: "user_joined", user: entry.user });
            }
          }
        }
        for (const id of Array.from(this.roomParticipants.keys())) {
          if (!seen.has(id) && id !== user.id) {
            this.roomParticipants.delete(id);
            this.emit({ type: "user_left", userId: id });
          }
        }
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({ user });

        const res = await fetch(
          `/api/rooms/${encodeURIComponent(roomId)}/messages`,
        ).catch(() => null);
        const history = res && res.ok ? await res.json() : { messages: [] };

        this.emit({
          type: "room_state",
          room: {
            id: roomId,
            name: roomId.charAt(0).toUpperCase() + roomId.slice(1).replace(/-/g, " "),
            createdAt: Date.now(),
            participants: Array.from(this.roomParticipants.values()),
          },
          messages: history.messages ?? [],
        });

        this.broadcast(channel, { type: "user_joined", user });
        this.broadcast(this.globalChannel, { type: "user_updated", user });

        const sys = this.sysMessage(roomId, `${user.name} joined the room`);
        this.emit({ type: "chat_message", message: sys });
        this.broadcast(channel, { type: "chat_message", message: sys });
      });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    const channels = [this.globalChannel, this.roomChannel, this.userChannel];
    this.globalChannel = null;
    this.roomChannel = null;
    this.userChannel = null;
    for (const channel of channels) {
      if (channel) void supabase.removeChannel(channel);
    }
    this.onclose?.();
  }
}

export function createRealtimeSocket(): RealtimeSocket {
  return new RealtimeSocket();
}
