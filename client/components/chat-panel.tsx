"use client"

import * as React from "react"
import { useState, useRef, useEffect } from "react"
import { Send, Loader2, User, CheckCircle2, AlertCircle, Briefcase, Users, Search, FileText, ChevronRight, ChevronDown, SquareTerminal } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { GrokLogo } from "@/components/ui/grok-logo"
import { SourcingProgress } from "@/components/sourcing-progress"
import { SourcingWizard, SourcingConfig } from "@/components/sourcing-wizard"

interface ActiveTask {
  taskId: string
  jobTitle?: string
  searchQuery?: string
}

interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  toolCalls?: ToolCall[]
  isStreaming?: boolean
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
  start_sourcing: <Search className="size-4" />,
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
  start_sourcing: "Starting X/Twitter sourcing",
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
    
    let prompt = `Find ${config.candidateCount} ${roleLabel} candidates from GitHub`
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

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
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
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
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
                    content: last.content + parsed.content
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
                const isGitHubSourcing = toolName === "start_github_sourcing"
                
                if (isGitHubSourcing) {
                  const taskId = parsed.result.task_id as string
                  const newTask: ActiveTask = {
                    taskId,
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
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center space-y-8 animate-message-in">
              <div className="relative">
                <GrokLogo className="size-20 text-foreground" />
              </div>
              
              <div className="space-y-2 text-center">
                <h2 className="text-3xl font-bold tracking-tight">
                  Grok Recruiting
                </h2>
                <p className="text-muted-foreground text-lg max-w-md mx-auto">
                  Powered by xAI to help you find and hire the best talent.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl pt-4">
                {SUGGESTED_PROMPTS.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => item.isWizard ? setShowWizard(true) : handleSuggestedPrompt(item.prompt)}
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-muted/50 transition-all text-left group",
                      item.isWizard && "border-primary/30 bg-primary/5 hover:bg-primary/10"
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-lg text-foreground group-hover:scale-110 transition-transform",
                      item.isWizard ? "bg-primary/20" : "bg-muted"
                    )}>
                      <GrokLogo className="size-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{item.label}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {item.isWizard ? "Step-by-step sourcing setup" : item.prompt}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Sourcing Wizard */}
              {showWizard && (
                <div className="w-full max-w-xl mx-auto pt-6 animate-message-in">
                  <SourcingWizard
                    onComplete={handleWizardComplete}
                    onCancel={handleWizardCancel}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-8 pb-12">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "group relative flex gap-4 mx-auto max-w-3xl animate-message-in",
                  )}
                >
                  <div
                    className={cn(
                      "shrink-0 size-8 rounded-full flex items-center justify-center border shadow-sm",
                      message.role === "user"
                        ? "bg-background border-border text-foreground"
                        : "bg-primary text-primary-foreground border-primary"
                    )}
                  >
                    {message.role === "user" ? (
                      <User className="size-5" />
                    ) : (
                      <GrokLogo className="size-5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        {message.role === "user" ? "You" : "Grok"}
                      </span>
                    </div>

                    {message.content && (
                      <div className="prose dark:prose-invert max-w-none text-base leading-relaxed wrap-break-word chat-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                        {message.isStreaming && (
                          <span className="inline-block w-1.5 h-4 ml-1 bg-primary animate-pulse align-middle" />
                        )}
                      </div>
                    )}

                    {message.toolCalls && message.toolCalls.length > 0 && (
                      <div className="mt-4 space-y-3">
                        {message.toolCalls.map((tc, idx) => (
                          <ToolResultCard key={idx} toolCall={tc} />
                        ))}
                      </div>
                    )}

                  </div>
                </div>
              ))}

              {/* Active sourcing tasks */}
              {activeTasks.size > 0 && (
                <div className="space-y-3 max-w-3xl mx-auto">
                  {Array.from(activeTasks.values()).map(task => (
                    <SourcingProgress
                      key={task.taskId}
                      taskId={task.taskId}
                      jobTitle={task.jobTitle}
                      searchQuery={task.searchQuery}
                      onComplete={() => handleTaskComplete(task.taskId)}
                      onDismiss={() => handleTaskComplete(task.taskId)}
                    />
                  ))}
                </div>
              )}

              <div ref={bottomRef} className="h-4" />
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="shrink-0 bg-background/80 backdrop-blur-xl border-t p-4 z-20">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="relative group">
            <div className={cn(
              "relative flex items-end gap-2 p-2 rounded-2xl bg-muted/50 border border-transparent focus-within:border-primary/30 focus-within:bg-background transition-all shadow-sm",
              isLoading && "opacity-50 pointer-events-none"
            )}>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Grok anything..."
                className="flex-1 min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 px-3 py-2.5 text-base placeholder:text-muted-foreground/50"
                disabled={isLoading}
                rows={1}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isLoading}
                className={cn(
                  "mb-1 size-8 rounded-lg transition-all",
                  input.trim() ? "opacity-100 scale-100" : "opacity-0 scale-90"
                )}
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </div>
            <div className="text-center mt-2">
              <p className="text-[10px] text-muted-foreground/40 font-medium tracking-wide uppercase">
                Grok may make mistakes. Verify important information.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function ToolResultCard({ toolCall }: { toolCall: ToolCall }) {
  const [isExpanded, setIsExpanded] = useState(true)
  const result = toolCall.result
  
  // Don't show if execution and no result yet
  if (!result && toolCall.isExecuting) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 animate-pulse">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">{TOOL_LABELS[toolCall.name] || "Thinking..."}</span>
      </div>
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
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                        (c.match_score ?? c.similarity_score ?? 0) >= 80 ? "bg-green-500/10 text-green-600" : "bg-yellow-500/10 text-yellow-600"
                      )}>
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
            <CheckCircle2 className="size-3.5 text-green-500" />
            <span>Task started - tracking progress below</span>
          </div>
        )
      }
      return (
        <div className="flex items-center gap-3 text-green-600 bg-green-500/5 p-3 rounded-lg border border-green-500/20">
          <CheckCircle2 className="size-4" />
          <span className="text-sm font-medium">{(result as { message?: string }).message}</span>
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
    <div className="w-full max-w-2xl my-2">
      <div className="border rounded-xl overflow-hidden bg-background/50 backdrop-blur-sm">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 w-full p-3 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
        >
          <div className="p-1.5 bg-background rounded-md shadow-sm border">
            {TOOL_ICONS[toolCall.name] || <SquareTerminal className="size-4" />}
          </div>
          <span className="text-sm font-medium">
            {TOOL_LABELS[toolCall.name] || toolCall.name}
          </span>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {toolCall.result?.success ? (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="size-3" />
                Done
              </span>
            ) : (
              <span className="flex items-center gap-1">
                Completed
              </span>
            )}
            {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </div>
        </button>
        
        {isExpanded && (
          <div className="p-3 border-t bg-background/30">
            {renderContent()}
          </div>
        )}
      </div>
    </div>
  )
}
