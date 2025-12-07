"use client"

import { ChatPanel } from "@/components/chat-panel"

export default function ChatPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)] w-full max-w-5xl mx-auto">
      <div className="flex-1 min-h-0 overflow-hidden">
        <ChatPanel />
      </div>
    </div>
  )
}
