import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { ErrorBoundary } from "@/legacy/components/ErrorBoundary";

const App = lazy(() => import("@/legacy/App"));

const TITLE = "LiveCall & Web Chat — Legacy iOS Friendly Calls";
const DESCRIPTION =
  "Real-time 1v1 and group chat, audio/video calls with legacy iOS compatibility, AI translation, media sharing, and admin moderation.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Loading() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
      }}
    >
      Loading LiveCall…
    </div>
  );
}

function Index() {
  return (
    <ClientOnly fallback={<Loading />}>
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <App />
        </Suspense>
      </ErrorBoundary>
    </ClientOnly>
  );
}
