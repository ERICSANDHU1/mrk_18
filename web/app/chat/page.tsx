import { Suspense } from "react";
import ChatClient from "@/components/app/chat/ChatClient";

/** Full-page chat with the CMO (Groq), grounded in the founder's company memory. */
export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatClient />
    </Suspense>
  );
}
