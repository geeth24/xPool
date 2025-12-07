"use client"

import * as React from "react"
import { useState, useRef, useEffect } from "react"
import { Send, Loader2, User, CheckCircle2, AlertCircle, Briefcase, Users, Search, FileText, ChevronDown, SquareTerminal, SlidersHorizontal, X } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { GrokLogo } from "@/components/ui/grok-logo"
import { Slider } from "@/components/ui/slider"
import { SourcingProgress } from "@/components/sourcing-progress"
import { SourcingWizard, SourcingConfig } from "@/components/sourcing-wizard"

interface ActiveTask {
  taskId: string
  jobId?: string
  jobTitle?: string
  searchQuery?: string
}

interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  toolCalls?: ToolCall[]
  isStreaming?: boolean
  isProcessingTools?: boolean
  activeTasks?: ActiveTask[]
}

interface ToolCall {
  name: string
  result?: {
    success: boolean
    [key: string]: unknown
  }
  isExecuting?: boolean
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  list_jobs: <Briefcase className="size-4" />,
  get_job_details: <Briefcase className="size-4" />,
  create_job: <Briefcase className="size-4" />,
  start_github_sourcing: <Search className="size-4" />,
  get_job_candidates: <Users className="size-4" />,
  search_candidates: <Users className="size-4" />,
  get_candidate_details: <Users className="size-4" />,
  generate_evidence_cards: <FileText className="size-4" />,
  check_task_status: <Loader2 className="size-4" />,
}

const TOOL_LABELS: Record<string, string> = {
  list_jobs: "Listing jobs",
  get_job_details: "Getting job details",
  create_job: "Creating job",
  start_github_sourcing: "Starting GitHub sourcing",
  get_job_candidates: "Getting candidates",
  search_candidates: "Searching candidates",
  get_candidate_details: "Getting candidate details",
  generate_evidence_cards: "Generating evidence",
  check_task_status: "Checking task status",
}

const SUGGESTED_PROMPTS = [
  { label: "Show open jobs", prompt: "Show me all open jobs", isWizard: false },
  { label: "Create iOS Job", prompt: "Create a job for Senior iOS Engineer", isWizard: false },
  { label: "🧙 Guided Sourcing", prompt: "", isWizard: true },
  { label: "Top Candidates", prompt: "Show me the top candidates for the latest job", isWizard: false },
]

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [activeTasks, setActiveTasks] = useState<Map<string, ActiveTask>>(new Map())
  const [showWizard, setShowWizard] = useState(false)
  const [showCollectionMode, setShowCollectionMode] = useState(false)
  const [candidateCount, setCandidateCount] = useState(25)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const handleTaskComplete = (taskId: string) => {
    setActiveTasks(prev => {
      const next = new Map(prev)
      next.delete(taskId)
      return next
    })
  }

  const handleWizardComplete = async (config: SourcingConfig) => {
    setShowWizard(false)
    
    // build the prompt from wizard config
    const roleLabel = config.customRole || config.roleType.replace(/_/g, " ")
    const locationLabel = config.customLocation || config.location.replace(/_/g, " ")
    const skillsText = config.skills.length > 0 ? config.skills.join(", ") : ""
    
    // use collection mode count if active, otherwise wizard config
    const count = showCollectionMode ? candidateCount : config.candidateCount
    let prompt = `Find ${roleLabel} candidates from GitHub`
    if (config.jobId) {
      prompt += ` for job ID ${config.jobId}`
    }
    if (config.location !== "remote") {
      prompt += ` in ${locationLabel}`
    }
    if (skillsText) {
      prompt += ` with skills in ${skillsText}`
    }
    if (config.experienceLevel !== "any") {
      prompt += ` (${config.experienceLevel} level)`
    }
    
    // always append collection mode with the count
    prompt += ` [Collection: ${count}]`
    
    // enable collection mode with the wizard count
    setShowCollectionMode(true)
    setCandidateCount(count)
    
    setInput(prompt)
    // auto submit after a brief delay
    setTimeout(() => {
      const form = document.querySelector("form")
      if (form) {
        form.requestSubmit()
      }
    }, 100)
  }

  const handleWizardCancel = () => {
    setShowWizard(false)
  }

  // auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isLoading) return

    // display content is clean, API content includes collection mode
    const displayContent = input.trim()
    let apiContent = displayContent
    if (showCollectionMode) {
      apiContent += ` [Collection: ${candidateCount}]`
    }

    // user message shown in UI (clean)
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: displayContent,
    }

    // message sent to API (with collection tag)
    const apiMessage = {
      role: "user",
      content: apiContent,
    }

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      isStreaming: true,
      toolCalls: [],
    }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setInput("")
    setIsLoading(true)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const response = await fetch(`${apiUrl}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            apiMessage
          ],
          stream: true,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error("No reader available")

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6)
          if (data === "[DONE]") continue

          try {
            const parsed = JSON.parse(data)

            if (parsed.type === "content") {
              setMessages((prev) => {
                const newMessages = [...prev]
                const lastIdx = newMessages.length - 1
                const last = newMessages[lastIdx]
                if (last.role === "assistant") {
                  newMessages[lastIdx] = {
                    ...last,
                    content: last.content + parsed.content,
                    isProcessingTools: false
                  }
                }
                return newMessages
              })
            } else if (parsed.type === "tool_start") {
              setMessages((prev) => {
                const newMessages = [...prev]
                const lastIdx = newMessages.length - 1
                const last = newMessages[lastIdx]
                if (last.role === "assistant") {
                  newMessages[lastIdx] = {
                    ...last,
                    isProcessingTools: true,
                    toolCalls: parsed.tools.map((name: string) => ({
                      name,
                      isExecuting: true,
                    }))
                  }
                }
                return newMessages
              })
            } else if (parsed.type === "tool_result") {
              setMessages((prev) => {
                const newMessages = [...prev]
                const lastIdx = newMessages.length - 1
                const last = newMessages[lastIdx]
                if (last.role === "assistant" && last.toolCalls) {
                  newMessages[lastIdx] = {
                    ...last,
                    toolCalls: last.toolCalls.map((tc) =>
                      tc.name === parsed.tool
                        ? { ...tc, result: parsed.result, isExecuting: false }
                        : tc
                    )
                  }
                }
                return newMessages
              })

              // detect GitHub sourcing tasks and add to active tasks for progress tracking
              if (parsed.result?.success && parsed.result?.task_id) {
                const toolName = parsed.tool as string
                
                if (toolName === "start_github_sourcing") {
                  const taskId = parsed.result.task_id as string
                  const newTask: ActiveTask = {
                    taskId,
                    jobId: parsed.result.job_id as string | undefined,
                    jobTitle: parsed.result.job_title as string | undefined,
                    searchQuery: parsed.result.search_query as string | undefined,
                  }
                  setActiveTasks(prev => {
                    const next = new Map(prev)
                    next.set(taskId, newTask)
                    return next
                  })
                }
              }
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      // mark streaming complete
      setMessages((prev) => {
        const newMessages = [...prev]
        const lastIdx = newMessages.length - 1
        const last = newMessages[lastIdx]
        if (last.role === "assistant") {
          newMessages[lastIdx] = { ...last, isStreaming: false }
        }
        return newMessages
      })
    } catch (error) {
      console.error("Chat error:", error)
      setMessages((prev) => {
        const newMessages = [...prev]
        const lastIdx = newMessages.length - 1
        const last = newMessages[lastIdx]
        if (last.role === "assistant") {
          newMessages[lastIdx] = {
            ...last,
            content: "Sorry, I encountered an error. Please try again.",
            isStreaming: false
          }
        }
        return newMessages
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleSuggestedPrompt = (prompt: string) => {
    setInput(prompt)
    textareaRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-full bg-background relative font-sans">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-3xl mx-auto px-4 py-8 min-h-full flex flex-col justify-center">
          <AnimatePresence mode="wait">
            {messages.length === 0 ? (
              <motion.div 
                key="welcome"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="flex flex-col items-center justify-center space-y-8"
              >
                <motion.div 
                  className="relative"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.5, type: "spring", stiffness: 200 }}
                >
                  <GrokLogo className="size-20 text-foreground" />
                </motion.div>
                
                <motion.div 
                  className="space-y-2 text-center"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                >
                  <h2 className="text-3xl font-bold tracking-tight">
                    Grok Recruiting
                  </h2>
                  <p className="text-muted-foreground text-lg max-w-md mx-auto">
                    Powered by xAI to help you find and hire the best talent.
                  </p>
                </motion.div>

                <motion.div 
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl pt-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                >
                  {SUGGESTED_PROMPTS.map((item, index) => (
                    <motion.button
                      key={item.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.35 + index * 0.08, duration: 0.3 }}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => item.isWizard ? setShowWizard(true) : handleSuggestedPrompt(item.prompt)}
                      className={cn(
                        "flex items-center gap-3 p-4 rounded-xl glass-card text-left group",
                        item.isWizard && "border-foreground/20"
                      )}
                    >
                      <div className={cn(
                        "p-2 rounded-lg text-foreground transition-transform group-hover:scale-110",
                        item.isWizard ? "bg-foreground/10" : "bg-muted"
                      )}>
                        <GrokLogo className="size-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{item.label}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {item.isWizard ? "Step-by-step sourcing setup" : item.prompt}
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </motion.div>

                {/* Sourcing Wizard */}
                <AnimatePresence>
                  {showWizard && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.3 }}
                      className="w-full max-w-xl mx-auto pt-6"
                    >
                      <SourcingWizard
                        onComplete={handleWizardComplete}
                        onCancel={handleWizardCancel}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div 
                key="messages"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8 pb-12"
              >
                {messages.map((message, msgIndex) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: msgIndex === messages.length - 1 ? 0 : 0 }}
                    className="group relative flex gap-4 mx-auto max-w-3xl"
                  >
                    <motion.div
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        "shrink-0 size-8 rounded-full flex items-center justify-center border shadow-sm",
                        message.role === "user"
                          ? "bg-background border-border text-foreground"
                          : "bg-foreground text-background border-foreground"
                      )}
                    >
                      {message.role === "user" ? (
                        <User className="size-4" />
                      ) : (
                        <GrokLogo className="size-4" />
                      )}
                    </motion.div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">
                          {message.role === "user" ? "You" : "Grok"}
                        </span>
                      </div>

                      {message.content ? (
                        <div className={cn(
                          "prose dark:prose-invert max-w-none text-base leading-relaxed wrap-break-word chat-markdown",
                          message.isStreaming && "streaming-text"
                        )}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : message.isStreaming && message.role === "assistant" ? (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-center gap-2 text-muted-foreground"
                        >
                          <Loader2 className="size-4 animate-spin" />
                          <span className="text-sm">
                            {message.isProcessingTools && message.toolCalls?.length 
                              ? `Running ${message.toolCalls.map(tc => TOOL_LABELS[tc.name] || tc.name).join(", ")}...`
                              : "Thinking..."}
                          </span>
                        </motion.div>
                      ) : null}

                      {/* Show tool execution status while processing */}
                      {message.isStreaming && message.isProcessingTools && message.toolCalls && message.toolCalls.length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="mt-3 space-y-2"
                        >
                          {message.toolCalls.map((tc, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <div className="p-1 bg-foreground/5 rounded">
                                {tc.isExecuting ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : tc.result?.success ? (
                                  <CheckCircle2 className="size-3 text-green-500" />
                                ) : (
                                  TOOL_ICONS[tc.name] || <SquareTerminal className="size-3" />
                                )}
                              </div>
                              <span>{TOOL_LABELS[tc.name] || tc.name}</span>
                              {tc.result && !tc.isExecuting && (
                                <CheckCircle2 className="size-3 text-green-500" />
                              )}
                            </div>
                          ))}
                        </motion.div>
                      )}

                      {/* Show tool results after streaming is done */}
                      {!message.isStreaming && message.toolCalls && message.toolCalls.length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: 0.1 }}
                          className="mt-4 space-y-3"
                        >
                          {message.toolCalls.map((tc, idx) => (
                            <ToolResultCard key={idx} toolCall={tc} />
                          ))}
                        </motion.div>
                      )}

                    </div>
                  </motion.div>
                ))}

                {/* Active sourcing tasks */}
                <AnimatePresence>
                  {activeTasks.size > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-3 max-w-3xl mx-auto pl-12"
                    >
                      {Array.from(activeTasks.values()).map(task => (
                        <SourcingProgress
                          key={task.taskId}
                          taskId={task.taskId}
                          jobId={task.jobId}
                          jobTitle={task.jobTitle}
                          searchQuery={task.searchQuery}
                          onDismiss={() => handleTaskComplete(task.taskId)}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div ref={bottomRef} className="h-4" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Input Area */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="shrink-0 p-4 pb-6 z-20"
      >
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            {/* Collection Mode Panel */}
            <AnimatePresence>
              {showCollectionMode && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: "auto", marginBottom: 12 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="glass-card rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="size-4 text-foreground/70" />
                        <span className="text-sm font-medium">Collection Mode</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCollectionMode(false)}
                        className="p-1 rounded-md hover:bg-foreground/10 transition-colors"
                      >
                        <X className="size-4 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Candidates to collect</span>
                        <span className="font-semibold text-foreground tabular-nums">{candidateCount}</span>
                      </div>
                      <Slider
                        value={[candidateCount]}
                        onValueChange={(value) => setCandidateCount(value[0])}
                        min={5}
                        max={100}
                        step={5}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground/60">
                        <span>5</span>
                        <span>Quick (25)</span>
                        <span>Deep (50)</span>
                        <span>100</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground/70">
                      Your sourcing requests will collect {candidateCount} candidates
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div 
              className={cn(
                "relative flex flex-col gap-2 p-3 rounded-xl glass-card transition-all duration-200",
                isLoading && "opacity-50 pointer-events-none"
              )}
            >
              <div className="flex items-end gap-3">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Grok anything..."
                  className="flex-1 min-h-[40px] max-h-[120px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:outline-none py-1 text-base placeholder:text-muted-foreground/60"
                  disabled={isLoading}
                  rows={1}
                />
                <motion.div
                  initial={false}
                  animate={{ 
                    scale: input.trim() ? 1 : 0.9,
                    opacity: input.trim() ? 1 : 0.5 
                  }}
                  transition={{ duration: 0.15 }}
                >
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!input.trim() || isLoading}
                    className="size-9 rounded-lg bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30"
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </motion.div>
              </div>
              
              {/* Input toolbar */}
              <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                <button
                  type="button"
                  onClick={() => setShowCollectionMode(!showCollectionMode)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all",
                    showCollectionMode 
                      ? "bg-foreground/10 text-foreground" 
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  )}
                >
                  <SlidersHorizontal className="size-3.5" />
                  <span>Collection</span>
                  {showCollectionMode && (
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-foreground/10 text-[10px] tabular-nums">
                      {candidateCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
            <p className="text-center mt-3 text-[10px] text-muted-foreground/50 font-medium tracking-wide">
              Grok may make mistakes · Verify important information
            </p>
          </form>
        </div>
      </motion.div>
    </div>
  )
}

function ToolResultCard({ toolCall }: { toolCall: ToolCall }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const result = toolCall.result
  
  // Don't show if execution and no result yet
  if (!result && toolCall.isExecuting) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 p-3 rounded-lg glass-card"
      >
        <Loader2 className="size-4 animate-spin text-foreground" />
        <span className="text-sm text-muted-foreground">{TOOL_LABELS[toolCall.name] || "Thinking..."}</span>
      </motion.div>
    )
  }

  if (!result) return null

  // format specific results nicely
  const renderContent = () => {
    if (!result.success) {
      return (
        <div className="flex items-center gap-2 text-destructive text-sm p-2">
          <AlertCircle className="size-4" />
          <span>Error: {(result as { error?: string }).error || "Unknown error"}</span>
        </div>
      )
    }

    // jobs list
    if ("jobs" in result && Array.isArray(result.jobs)) {
      const jobs = result.jobs as Array<{
        id: string
        title: string
        keywords?: string[]
      }>
      return (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
            >
              <div>
                <p className="font-medium text-sm">{job.title}</p>
                {job.keywords && (
                  <div className="flex gap-1 mt-1">
                    {job.keywords.slice(0, 3).map(k => (
                      <span key={k} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                View
              </Button>
            </div>
          ))}
        </div>
      )
    }

    // candidates list
    if ("candidates" in result && Array.isArray(result.candidates)) {
      const candidates = result.candidates as Array<{
        id: string
        x_username?: string
        github_username?: string
        display_name?: string
        match_score?: number
        similarity_score?: number
        skills?: string[]
      }>
      
      if (candidates.length === 0) {
        return (
          <div className="flex items-center gap-2 text-muted-foreground text-sm p-3">
            <Users className="size-4" />
            <span>{(result as { message?: string }).message || "No candidates found"}</span>
          </div>
        )
      }
      
      return (
        <div className="grid gap-2">
          {candidates.slice(0, 4).map((c) => (
            <div
              key={c.id}
              className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <User className="size-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">
                      {c.display_name || c.github_username || `@${c.x_username}`}
                    </p>
                    {(c.match_score !== undefined || c.similarity_score !== undefined) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-foreground/10 text-foreground/70">
                        {Math.round(c.match_score ?? c.similarity_score ?? 0)}%
                      </span>
                    )}
                  </div>
                  {c.skills && c.skills.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.skills.slice(0, 3).join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {candidates.length > 4 && (
            <Button variant="ghost" className="w-full text-xs h-8">
              View {candidates.length - 4} more candidates
            </Button>
          )}
        </div>
      )
    }

    // task started - show minimal indicator since progress component handles the rest
    if ("task_id" in result) {
      const isGitHubSourcing = toolCall.name === "start_github_sourcing"
      if (isGitHubSourcing) {
        // progress component will show details, just show brief confirmation
        return (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-1">
            <CheckCircle2 className="size-3.5 text-foreground/60" />
            <span>Task started - tracking progress below</span>
          </div>
        )
      }
      return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-foreground/5 border border-foreground/10">
          <CheckCircle2 className="size-4 text-foreground/70" />
          <span className="text-sm font-medium text-foreground">{(result as { message?: string }).message}</span>
        </div>
      )
    }

    // generic result
    return (
      <div className="relative">
         <pre className="text-xs font-mono overflow-auto max-h-[200px] p-3 rounded-lg bg-muted/50 text-muted-foreground">
          {JSON.stringify(result, null, 2)}
        </pre>
      </div>
    )
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full my-2"
    >
      <div className="rounded-xl overflow-hidden glass-card">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 w-full p-3 hover:bg-foreground/5 transition-colors text-left"
        >
          <div className="p-1.5 bg-foreground/5 rounded-md">
            {TOOL_ICONS[toolCall.name] || <SquareTerminal className="size-4" />}
          </div>
          <span className="text-sm font-medium">
            {TOOL_LABELS[toolCall.name] || toolCall.name}
          </span>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {toolCall.result?.success ? (
              <span className="flex items-center gap-1 text-foreground/70">
                <CheckCircle2 className="size-3" />
                Done
              </span>
            ) : (
              <span className="flex items-center gap-1">
                Completed
              </span>
            )}
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="size-3" />
            </motion.div>
          </div>
        </button>
        
        <AnimatePresence>
          {isExpanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-3 border-t border-border/30">
                {renderContent()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
