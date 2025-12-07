"use client"

import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import { 
  X, Mail, ChevronUp, ChevronDown, Github, Linkedin, 
  MapPin, Globe, Phone, Zap, ThumbsUp, ThumbsDown, AlertCircle, Info,
  ExternalLink, MessageCircle, Loader2, Copy, Send
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { GrokLogo } from "@/components/ui/grok-logo"
import { cn } from "@/lib/utils"
import { jobsApi } from "@/lib/api"
import { toast } from "sonner"
import type { JobCandidate, CandidateStatus, EvidenceFeedbackCreate } from "@/lib/api/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

interface EvidenceCard {
  why_matched?: string
  green_flags?: string[]
  red_flags?: string[]
  signals?: string[]
  outreach_hook?: string
}

// email template generator
function generateOutreachEmail(candidateName: string, jobTitle: string, outreachHook?: string) {
  const firstName = candidateName.split(" ")[0] || candidateName
  const hook = outreachHook || `I came across your profile and was really impressed by your work.`
  
  return `🚀 Opportunity at xAI - ${jobTitle} ⚡️

Hi ${firstName},

This is a message from xAI. We are a Series C hyper-growth startup and one of the leaders in frontier AI development. The team is building robust, scalable systems that bring Grok, xAI's cutting-edge technology, into real-world applications. As a tight-knit group of exceptionally driven engineers, we tackle some of the most challenging and unsolved problems in AI.

${hook}

We're currently looking for exceptional engineers for our ${jobTitle} role — people who are both hands-on and visionary, who care deeply about elegant engineering and moving fast with purpose.

Would you be open to a short chat to explore how your experience might align with what we're building? I'd love to share more about the problems we're solving — they're truly unlike anything else out there.

Best regards,

[Your Name]
Technical Recruiting @xAI 🚀 Build AI That Advances Humanity ⚡️`
}

// contact dialog for fullscreen viewer
interface ContactDialogFullscreenProps {
  candidate: {
    id: string
    display_name?: string
    github_username?: string
    email?: string
    x_username?: string
    linkedin_url?: string
  }
  jobTitle: string
  outreachHook?: string
  onContact: () => void
  trigger: React.ReactNode
}

function ContactDialogFullscreen({ candidate, jobTitle, outreachHook, onContact, trigger }: ContactDialogFullscreenProps) {
  const [open, setOpen] = useState(false)
  const candidateName = candidate.display_name || candidate.github_username || "there"
  const [emailBody, setEmailBody] = useState(() => 
    generateOutreachEmail(candidateName, jobTitle, outreachHook)
  )
  
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setEmailBody(generateOutreachEmail(candidateName, jobTitle, outreachHook))
    }
    setOpen(isOpen)
  }
  
  const handleCopy = () => {
    navigator.clipboard.writeText(emailBody)
    toast.success("Email copied to clipboard!")
  }
  
  const handleSendEmail = () => {
    if (candidate.email) {
      const subject = encodeURIComponent(`🚀 Opportunity at xAI - ${jobTitle} ⚡️`)
      const body = encodeURIComponent(emailBody)
      window.open(`mailto:${candidate.email}?subject=${subject}&body=${body}`, "_blank")
      onContact()
      setOpen(false)
    } else {
      toast.error("No email available for this candidate")
    }
  }
  
  const handleLinkedIn = () => {
    if (candidate.linkedin_url) {
      navigator.clipboard.writeText(emailBody)
      toast.success("Message copied! Opening LinkedIn...")
      window.open(candidate.linkedin_url, "_blank")
      onContact()
      setOpen(false)
    }
  }
  
  const handleXDM = () => {
    if (candidate.x_username) {
      const username = candidate.x_username.replace("@", "")
      navigator.clipboard.writeText(emailBody)
      toast.success("Message copied! Opening X...")
      window.open(`https://x.com/messages/compose?recipient_id=${username}`, "_blank")
      onContact()
      setOpen(false)
    }
  }
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Contact {candidateName}
          </DialogTitle>
          <DialogDescription>
            Customize the outreach message below before sending
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email-body-fullscreen">Message</Label>
            <Textarea
              id="email-body-fullscreen"
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
              placeholder="Your outreach message..."
            />
          </div>
        </div>
        
        <DialogFooter className="flex-col sm:flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleCopy} className="w-full sm:w-auto">
            <Copy className="h-4 w-4 mr-2" />
            Copy Message
          </Button>
          
          <div className="flex gap-2 w-full sm:w-auto">
            {candidate.x_username && (
              <Button variant="outline" onClick={handleXDM} className="flex-1">
                <span className="text-xs font-bold mr-2">𝕏</span>
                DM
              </Button>
            )}
            {candidate.linkedin_url && (
              <Button variant="outline" onClick={handleLinkedIn} className="flex-1">
                <Linkedin className="h-4 w-4 mr-2" />
                LinkedIn
              </Button>
            )}
            {candidate.email && (
              <Button onClick={handleSendEmail} className="flex-1">
                <Send className="h-4 w-4 mr-2" />
                Send Email
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// feedback item for individual evidence items
interface FeedbackItemProps {
  content: string
  itemType: string
  itemIndex: number
  jobId: string
  candidateId: string
  variant: "green" | "red" | "amber"
}

function FeedbackItem({ content, itemType, itemIndex, jobId, candidateId, variant }: FeedbackItemProps) {
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleFeedback = async (type: "positive" | "negative") => {
    if (!jobId || !candidateId) return
    
    setIsSubmitting(true)
    try {
      const feedbackData: EvidenceFeedbackCreate = {
        feedback_type: type,
        feedback_target: itemType,
        comment: `Item ${itemIndex + 1}: ${content.substring(0, 100)}`,
      }
      await jobsApi.submitEvidenceFeedback(jobId, candidateId, feedbackData)
      setFeedback(type)
    } catch {
      toast.error("Failed to submit feedback")
    } finally {
      setIsSubmitting(false)
    }
  }

  const variantStyles = {
    green: "text-emerald-400",
    red: "text-rose-400",
    amber: "text-amber-400",
  }

  return (
    <li className="text-sm flex items-start gap-2 group">
      <span className={`${variantStyles[variant]} mt-1 shrink-0`}>•</span>
      <span className="flex-1">{content}</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {feedback ? (
          <span className="text-xs text-muted-foreground">
            {feedback === "positive" ? "👍" : "👎"}
          </span>
        ) : (
          <>
            <button
              onClick={() => handleFeedback("positive")}
              disabled={isSubmitting}
              className="p-1 rounded hover:bg-emerald-500/20 text-muted-foreground hover:text-emerald-400 transition-colors"
            >
              {isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ThumbsUp className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={() => handleFeedback("negative")}
              disabled={isSubmitting}
              className="p-1 rounded hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400 transition-colors"
            >
              {isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ThumbsDown className="h-3.5 w-3.5" />
              )}
            </button>
          </>
        )}
      </div>
    </li>
  )
}

interface CandidateFullscreenViewerProps {
  candidates: JobCandidate[]
  initialIndex: number
  jobId: string
  jobTitle: string
  onClose: () => void
  onAction: () => void
}

export function CandidateFullscreenViewer({
  candidates,
  initialIndex,
  jobId,
  jobTitle,
  onClose,
  onAction
}: CandidateFullscreenViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  
  const currentCandidate = candidates[currentIndex]
  const jc = currentCandidate
  const candidate = jc?.candidate
  const evidence = jc?.evidence as EvidenceCard | null

  const goNext = useCallback(() => {
    if (currentIndex < candidates.length - 1) {
      setCurrentIndex(prev => prev + 1)
    }
  }, [currentIndex, candidates.length])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
    }
  }, [currentIndex])

  // keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault()
        goNext()
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault()
        goPrev()
      } else if (e.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [goNext, goPrev, onClose])

  // lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  const trackAction = async (action: "shortlist" | "contact" | "reject") => {
    if (!candidate) return
    setActionLoading(action)
    try {
      await jobsApi.trackAction(jobId, candidate.id, { action })
      toast.success(`Candidate ${action === "shortlist" ? "shortlisted" : action === "contact" ? "contacted" : "rejected"}`)
      onAction()
      // auto-advance to next after action
      if (currentIndex < candidates.length - 1) {
        setTimeout(() => goNext(), 300)
      }
    } catch {
      toast.error("Failed to update")
    } finally {
      setActionLoading(null)
    }
  }

  const handleContactAction = () => {
    trackAction("contact")
  }

  if (!candidate) return null

  const getAvatarUrl = () => {
    if (candidate.github_username) return `https://unavatar.io/github/${candidate.github_username}`
    if (candidate.x_username) return `https://unavatar.io/twitter/${candidate.x_username.replace("@", "")}`
    return ""
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400 border-emerald-500/50 bg-emerald-500/20"
    if (score >= 50) return "text-amber-400 border-amber-500/50 bg-amber-500/20"
    return "text-rose-400 border-rose-500/50 bg-rose-500/20"
  }

  const isShortlisted = jc.status === "shortlisted" as CandidateStatus
  const isRejected = jc.status === "rejected" as CandidateStatus

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm"
    >
      {/* header with close and navigation */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentIndex + 1} of {candidates.length}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={goPrev}
            disabled={currentIndex === 0}
          >
            <ChevronUp className="h-5 w-5" />
          </Button>
          <Button 
            variant="outline" 
            size="icon"
            onClick={goNext}
            disabled={currentIndex === candidates.length - 1}
          >
            <ChevronDown className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* main content */}
      <div className="h-full overflow-y-auto pt-20 pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={candidate.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="max-w-3xl mx-auto px-6"
          >
            {/* profile header */}
            <div className="flex items-start gap-6 mb-8">
              <Avatar className="h-24 w-24 border-4 border-background shadow-xl">
                <AvatarImage src={getAvatarUrl()} />
                <AvatarFallback className="text-2xl font-bold">
                  {(candidate.display_name || candidate.github_username || "?").substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                      {candidate.display_name || candidate.github_username}
                      {isShortlisted && <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50">Shortlisted</Badge>}
                      {isRejected && <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/50">Rejected</Badge>}
                    </h1>
                    
                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      {candidate.github_username && (
                        <a href={`https://github.com/${candidate.github_username}`} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
                          <Github className="h-4 w-4" /> {candidate.github_username}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {candidate.x_username && (
                        <a href={`https://x.com/${candidate.x_username.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
                          <span className="text-xs font-bold">𝕏</span> @{candidate.x_username.replace("@", "")}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {candidate.linkedin_url && (
                        <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-blue-400 flex items-center gap-1.5 transition-colors">
                          <Linkedin className="h-4 w-4" /> LinkedIn
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    
                    {candidate.location && (
                      <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" /> {candidate.location}
                      </div>
                    )}
                  </div>
                  
                  {jc.match_score !== null && jc.match_score !== undefined && (
                    <div className={cn("flex items-center gap-2 px-4 py-2 rounded-full border font-bold text-lg", getScoreColor(jc.match_score))}>
                      <GrokLogo className="h-5 w-5" />
                      {Math.round(jc.match_score)}% Match
                    </div>
                  )}
                </div>

                {/* contact info */}
                {(candidate.email || candidate.phone || candidate.website_url) && (
                  <div className="flex items-center gap-4 flex-wrap pt-2">
                    {candidate.email && (
                      <a href={`mailto:${candidate.email}`} className="text-sm text-primary hover:underline flex items-center gap-1.5">
                        <Mail className="h-4 w-4" /> {candidate.email}
                      </a>
                    )}
                    {candidate.phone && (
                      <a href={`tel:${candidate.phone}`} className="text-sm text-primary hover:underline flex items-center gap-1.5">
                        <Phone className="h-4 w-4" /> {candidate.phone}
                      </a>
                    )}
                    {candidate.website_url && (
                      <a href={candidate.website_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1.5">
                        <Globe className="h-4 w-4" /> Website
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* skills */}
            {candidate.skills_extracted && candidate.skills_extracted.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.skills_extracted.map(skill => (
                    <Badge key={skill} variant="secondary" className="text-sm px-3 py-1">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* AI analysis */}
            {evidence && (
              <div className="space-y-6 rounded-2xl bg-muted/30 p-6 border border-border/50">
                {evidence.why_matched && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" /> AI Summary
                    </h3>
                    <p className="text-base leading-relaxed">{evidence.why_matched}</p>
                  </div>
                )}

                <Separator className="bg-border/50" />

                <div className="grid gap-6 md:grid-cols-2">
                  {/* pros */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                      <ThumbsUp className="h-4 w-4" /> Pros
                    </h3>
                    <ul className="space-y-2">
                      {evidence.green_flags?.map((flag, i) => (
                        <FeedbackItem
                          key={i}
                          content={flag}
                          itemType="green_flags"
                          itemIndex={i}
                          jobId={jobId}
                          candidateId={candidate.id}
                          variant="green"
                        />
                      ))}
                      {(!evidence.green_flags || evidence.green_flags.length === 0) && (
                        <li className="text-sm text-muted-foreground italic">No specific pros identified.</li>
                      )}
                    </ul>
                  </div>

                  {/* cons & signals */}
                  <div className="space-y-6">
                    {evidence.red_flags && evidence.red_flags.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-rose-400 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" /> Cons
                        </h3>
                        <ul className="space-y-2">
                          {evidence.red_flags.map((flag, i) => (
                            <FeedbackItem
                              key={i}
                              content={flag}
                              itemType="red_flags"
                              itemIndex={i}
                              jobId={jobId}
                              candidateId={candidate.id}
                              variant="red"
                            />
                          ))}
                        </ul>
                      </div>
                    )}

                    {evidence.signals && evidence.signals.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                          <Info className="h-4 w-4" /> Signals
                        </h3>
                        <ul className="space-y-2">
                          {evidence.signals.map((signal, i) => (
                            <FeedbackItem
                              key={i}
                              content={signal}
                              itemType="signals"
                              itemIndex={i}
                              jobId={jobId}
                              candidateId={candidate.id}
                              variant="amber"
                            />
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* bio */}
            {candidate.bio && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Bio</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{candidate.bio}</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* fixed action bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-background/80 backdrop-blur-md border-t border-border/50">
        <div className="max-w-3xl mx-auto flex items-center justify-center gap-4">
          <Button 
            variant="outline" 
            size="lg"
            className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/50"
            onClick={() => trackAction("reject")}
            disabled={actionLoading !== null || isRejected}
          >
            <ThumbsDown className="h-5 w-5 mr-2" />
            {actionLoading === "reject" ? "..." : isRejected ? "Rejected" : "Reject"}
          </Button>
          
          <ContactDialogFullscreen
            candidate={candidate}
            jobTitle={jobTitle}
            outreachHook={evidence?.outreach_hook}
            onContact={handleContactAction}
            trigger={
              <Button 
                variant="outline" 
                size="lg"
                className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50"
                disabled={actionLoading !== null}
              >
                <MessageCircle className="h-5 w-5 mr-2" />
                {actionLoading === "contact" ? "..." : "Contact"}
              </Button>
            }
          />
          
          <Button 
            variant="outline"
            size="lg"
            className={cn(
              "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50",
              isShortlisted && "bg-emerald-500/20 border-emerald-500/50"
            )}
            onClick={() => trackAction("shortlist")}
            disabled={actionLoading !== null || isShortlisted}
          >
            <ThumbsUp className="h-5 w-5 mr-2" />
            {actionLoading === "shortlist" ? "..." : isShortlisted ? "Shortlisted" : "Shortlist"}
          </Button>
        </div>
        
        <p className="text-center text-xs text-muted-foreground mt-4">
          Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">↓</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">j</kbd> for next, <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">↑</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">k</kbd> for previous, <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Esc</kbd> to close
        </p>
      </div>
    </motion.div>
  )
}

