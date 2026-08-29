import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/livecall.server";

export const Route = createFileRoute("/api/ai/translate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Record<string, any>;
        const rawText = String(body["text"] ?? "").trim();
        const targetLanguage = String(body["targetLanguage"] ?? "English");
        const mode = String(body["mode"] ?? "translate");
        const tone = String(body["tone"] ?? "conversational");

        if (!rawText) {
          return json({ error: "Text is required for translation." }, 400);
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        const fallback = {
          detectedLanguage: "Auto",
          translatedText: rawText,
          originalEnhanced: rawText,
          targetLanguage,
          grammarNotes: "AI is unavailable right now. Showing original text.",
          isEnhanced: false,
        };
        if (!apiKey) return json(fallback);

        const prompt = `You are a real-time multilingual translator and linguistic editor for a live messaging and calling app.
Task:
1. Detect the source language.
2. If mode is "translate": Translate the input text faithfully and accurately into ${targetLanguage}. Ensure correct grammar, natural native phrasing, perfect punctuation, and keep the tone ${tone}. Maintain emojis, code snippets, numbers, and proper nouns.
3. If mode is "enhance": Polish the grammar, spelling, clarity, and sentence flow of the text in its original language, keeping the exact meaning.
4. If mode is "both": Provide both the grammatical polish in the original language and the high-accuracy translation into ${targetLanguage}.

Input Text:
"""${rawText}"""

Target Language: ${targetLanguage}
Requested Mode: ${mode}

Respond in STRICT JSON only, matching:
{"detectedLanguage":"string","translatedText":"string","originalEnhanced":"string","grammarNotes":"string","isEnhanced":true}`;

        try {
          const res = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "Lovable-API-Key": apiKey,
              },
              body: JSON.stringify({
                model: "google/gemini-3.7-flash",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
              }),
            },
          );

          if (!res.ok) {
            const message =
              res.status === 429
                ? "AI is rate limited. Try again shortly."
                : res.status === 402
                  ? "AI credits are exhausted. Add credits to continue."
                  : `AI request failed (${res.status}).`;
            return json({ ...fallback, grammarNotes: message });
          }

          const data = (await res.json()) as any;
          const content: string =
            data?.choices?.[0]?.message?.content ?? "";
          const cleaned = content
            .replace(/^```(?:json)?/i, "")
            .replace(/```$/, "")
            .trim();
          const parsed = JSON.parse(cleaned);
          return json({
            detectedLanguage: parsed.detectedLanguage ?? "Auto",
            translatedText: parsed.translatedText ?? rawText,
            originalEnhanced: parsed.originalEnhanced ?? rawText,
            targetLanguage,
            grammarNotes: parsed.grammarNotes ?? "",
            isEnhanced: true,
          });
        } catch {
          return json(fallback);
        }
      },
    },
  },
});
