"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import { jobsApi, candidatesApi, Job, JobCandidate, GitHubSourceRequest, CandidateStatus } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { toast } from "sonner"
import {
  ArrowLeft,
  RefreshCw,
  Users,
  Loader2,
  CheckCircle,
  Github,
  Search,
  Check,
  X,
  Mail,
  Zap,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  Info,
  Briefcase,
  MapPin,
  Linkedin,
  Phone,
  Globe,
  Sparkles,
  UserSearch
} from "lucide-react"
import { cn } from "@/lib/utils"
import { GrokLogo } from "@/components/ui/grok-logo"
import { EvidenceCard, EvidenceFeedbackCreate } from "@/lib/api/types"
import { LearningIndicator } from "@/components/learning-indicator"
import { SearchStrategyCard } from "@/components/search-strategy-card"
import { SemanticSearch } from "@/components/semantic-search"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card"
import { CandidateFullscreenViewer } from "@/components/candidate-fullscreen-viewer"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
import { Copy, Send } from "lucide-react"

type PipelineStage = "all" | "sourced" | "shortlisted" | "rejected"

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

// contact dialog component
interface ContactDialogProps {
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

function ContactDialog({ candidate, jobTitle, outreachHook, onContact, trigger }: ContactDialogProps) {
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
            <Label htmlFor="email-body">Message</Label>
            <Textarea
              id="email-body"
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

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.08,
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  }),
  exit: { opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.2 } },
}

// --- Find Similar Button Component ---

interface SimilarCandidate {
  id: string
  display_name: string
  github_username: string
  x_username: string
  bio: string
  skills_extracted: string[]
  location: string
  similarity_score: number
  github_url: string
  profile_url: string
}

function FindSimilarButton({ candidateId, candidateName }: { candidateId: string; jobId?: string; candidateName: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [similar, setSimilar] = useState<SimilarCandidate[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleFindSimilar = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await candidatesApi.findSimilar(candidateId, 8)
      setSimilar(result.similar_candidates)
      if (result.similar_candidates.length === 0) {
        setError("No similar candidates found. Try uploading more candidates to the collection.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to find similar candidates")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-primary hover:bg-primary/10"
          onClick={() => {
            setOpen(true)
            handleFindSimilar()
          }}
        >
          <UserSearch className="h-4 w-4 mr-2" />
          Find Similar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Similar to {candidateName}
          </DialogTitle>
          <DialogDescription>
            Candidates with similar skills and experience found using semantic search
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 mt-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Searching collection...</span>
            </div>
          )}
          
          {error && (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{error}</p>
            </div>
          )}
          
          {!loading && !error && similar.map((c) => (
            <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
              <Avatar className="h-10 w-10">
                <AvatarImage src={c.github_username ? `https://github.com/${c.github_username}.png` : undefined} />
                <AvatarFallback>{(c.display_name || c.github_username || "?").substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{c.display_name || c.github_username}</span>
                  <Badge variant="secondary" className="text-xs">{c.similarity_score}% match</Badge>
                </div>
                {c.github_username && (
                  <a href={`https://github.com/${c.github_username}`} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                    <Github className="h-3 w-3" /> {c.github_username}
                  </a>
                )}
                {c.skills_extracted && c.skills_extracted.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {c.skills_extracted.slice(0, 5).map(skill => (
                      <Badge key={skill} variant="outline" className="text-[10px] h-5">{skill}</Badge>
                    ))}
                  </div>
                )}
                {c.location && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3" /> {c.location}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// --- Components ---

interface EvidenceItemProps {
  content: string
  itemType: string
  itemIndex: number
  jobId: string
  candidateId: string
  variant: "green" | "red" | "neutral"
}

function EvidenceItemWithFeedback({ content, itemType, itemIndex, jobId, candidateId, variant }: EvidenceItemProps) {
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleFeedback = async (type: "positive" | "negative") => {
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
    green: { 
      bg: "bg-emerald-500/10 border-emerald-500/20", 
      text: "text-emerald-900 dark:text-emerald-100",
      icon: "text-emerald-600 dark:text-emerald-400",
      Icon: CheckCircle 
    },
    red: { 
      bg: "bg-rose-500/10 border-rose-500/20", 
      text: "text-rose-900 dark:text-rose-100",
      icon: "text-rose-600 dark:text-rose-400",
      Icon: AlertCircle 
    },
    neutral: { 
      bg: "bg-amber-500/10 border-amber-500/20", 
      text: "text-amber-900 dark:text-amber-100",
      icon: "text-amber-600 dark:text-amber-400",
      Icon: Info 
    },
  }

  const Style = variantStyles[variant]
  const Icon = Style.Icon

  return (
    <div className={cn("group relative flex gap-3 p-3 rounded-lg border transition-all hover:shadow-sm", Style.bg)}>
       <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", Style.icon)} />
       <div className="flex-1 min-w-0">
         <p className={cn("text-sm leading-relaxed", Style.text)}>{content}</p>
       </div>
       
       <div className="flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {feedback ? (
          <span className="text-xs text-muted-foreground font-medium px-2">
            {feedback === "positive" ? "Thanks! 👍" : "Thanks! 👎"}
          </span>
        ) : (
          <>
            <button
              onClick={() => handleFeedback("positive")}
              disabled={isSubmitting}
              className="p-1.5 rounded-md hover:bg-background/50 text-muted-foreground hover:text-green-600 transition-colors"
              title="Helpful"
            >
              {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => handleFeedback("negative")}
              disabled={isSubmitting}
              className="p-1.5 rounded-md hover:bg-background/50 text-muted-foreground hover:text-red-600 transition-colors"
              title="Not helpful"
            >
              {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

interface CandidateCardProps {
  jc: JobCandidate
  jobId: string
  jobTitle: string
  onAction: () => void
}

function CandidateCard({ jc, jobId, jobTitle, onAction }: CandidateCardProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [currentEvidence, setCurrentEvidence] = useState<EvidenceCard | null>(jc.evidence as unknown as EvidenceCard | null)
  const candidate = jc.candidate
  if (!candidate) return null

  const evidence = currentEvidence

  const trackAction = async (action: "shortlist" | "contact" | "reject") => {
    setActionLoading(action)
    try {
      await jobsApi.trackAction(jobId, candidate.id, { action })
      toast.success(`Candidate ${action === "shortlist" ? "shortlisted" : action === "contact" ? "contacted" : "rejected"}`)
      onAction()
    } catch {
      toast.error("Failed to update")
    } finally {
      setActionLoading(null)
    }
  }

  const handleRegenerate = async () => {
    setIsRegenerating(true)
    try {
      const result = await jobsApi.regenerateEvidence(jobId, candidate.id)
      toast.success(`Evidence regenerated using ${result.feedback_used} feedback examples`)
      if (result.evidence) {
        setCurrentEvidence(result.evidence as unknown as EvidenceCard)
      }
    } catch {
      toast.error("Failed to regenerate")
    } finally {
      setIsRegenerating(false)
    }
  }

  const getAvatarUrl = () => {
    if (candidate.github_username) return `https://unavatar.io/github/${candidate.github_username}`
    if (candidate.x_username) return `https://unavatar.io/twitter/${candidate.x_username.replace("@", "")}`
    return ""
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
    if (score >= 50) return "text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
    return "text-rose-600 border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800"
  }

  const isShortlisted = jc.status === CandidateStatus.SHORTLISTED
  const isRejected = jc.status === CandidateStatus.REJECTED

  return (
    <Card className={cn(
      "group overflow-hidden border-border/60 transition-all hover:shadow-md",
      isShortlisted && "border-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-900/5",
      isRejected && "border-rose-200 bg-rose-50/30 dark:bg-rose-900/5 opacity-75"
    )}>
      <CardHeader className="p-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 border-2 border-background shadow-sm">
              <AvatarImage src={getAvatarUrl()} />
              <AvatarFallback className="text-lg font-semibold">
                {(candidate.display_name || candidate.github_username || "?").substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="space-y-1.5">
               <div>
                 <h3 className="font-bold text-lg leading-none flex items-center gap-2">
                   {candidate.display_name || candidate.github_username}
                   {isShortlisted && <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200 h-5 text-[10px] px-1.5">Shortlisted</Badge>}
                   {isRejected && <Badge variant="outline" className="text-rose-600 bg-rose-50 border-rose-200 h-5 text-[10px] px-1.5">Rejected</Badge>}
                 </h3>
                 <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {candidate.github_username && (
                      <a href={`https://github.com/${candidate.github_username}`} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                        <Github className="h-3.5 w-3.5" /> {candidate.github_username}
                      </a>
                    )}
                    {candidate.x_username && (
                      <a href={`https://x.com/${candidate.x_username}`} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                        <span className="text-[10px] font-bold">𝕏</span> @{candidate.x_username.replace("@", "")}
                      </a>
                    )}
                    {candidate.linkedin_url && (
                      <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-blue-600 flex items-center gap-1 transition-colors">
                        <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                      </a>
                    )}
                    {candidate.location && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {candidate.location}
                      </span>
                    )}
                 </div>
                 {/* Contact Info */}
                 {(candidate.email || candidate.phone || candidate.website_url) && (
                   <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {candidate.email && (
                        <a href={`mailto:${candidate.email}`} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                          <Mail className="h-3.5 w-3.5" /> {candidate.email}
                        </a>
                      )}
                      {candidate.phone && (
                        <a href={`tel:${candidate.phone}`} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                          <Phone className="h-3.5 w-3.5" /> {candidate.phone}
                        </a>
                      )}
                      {candidate.website_url && (
                        <a href={candidate.website_url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                          <Globe className="h-3.5 w-3.5" /> Website
                        </a>
                      )}
                   </div>
                 )}
               </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {jc.match_score !== null && jc.match_score !== undefined ? (
              <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full border font-bold text-sm shadow-sm", getScoreColor(jc.match_score))}>
                <GrokLogo className="h-3.5 w-3.5" />
                {Math.round(jc.match_score)}% Match
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full border font-normal text-sm shadow-sm text-muted-foreground bg-muted/50 border-border">
                <GrokLogo className="h-3.5 w-3.5 opacity-50" />
                Not scored
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0 space-y-6">
        {/* Skills */}
        <div className="flex flex-wrap gap-1.5">
           {candidate.skills_extracted?.slice(0, 4).map(skill => (
             <Badge key={skill} variant="secondary" className="font-normal text-xs px-2.5 py-0.5 bg-secondary/60 hover:bg-secondary">
               {skill}
             </Badge>
           ))}
           {(candidate.skills_extracted?.length || 0) > 4 && (
             <Badge variant="outline" className="font-normal text-[10px] px-2 h-5">
               +{(candidate.skills_extracted?.length || 0) - 4}
             </Badge>
           )}
        </div>

        {/* AI Analysis Grid */}
        {evidence && (
          <div className="space-y-4 rounded-xl bg-muted/30 p-4 border border-border/50">
             {evidence.why_matched && (
               <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" /> AI Summary
                  </h4>
                  <p className="text-sm leading-relaxed text-foreground/90">{evidence.why_matched}</p>
               </div>
             )}

             <Separator className="bg-border/50" />

             <div className="grid gap-4 md:grid-cols-2">
                {/* Pros */}
                <div className="space-y-2">
                   <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                     <ThumbsUp className="h-3.5 w-3.5" /> Pros
                   </h4>
                   <div className="space-y-2">
                      {evidence.green_flags?.map((flag, i) => (
                        <EvidenceItemWithFeedback key={`green-${i}`} content={flag} itemType="green_flags" itemIndex={i} jobId={jobId} candidateId={candidate.id} variant="green" />
                      ))}
                      {(!evidence.green_flags || evidence.green_flags.length === 0) && (
                        <span className="text-xs text-muted-foreground italic">No specific pros identified.</span>
                      )}
                   </div>
                </div>

                {/* Cons & Signals */}
                <div className="space-y-4">
                   {evidence.red_flags && evidence.red_flags.length > 0 && (
                     <div className="space-y-2">
                       <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                         <AlertCircle className="h-3.5 w-3.5" /> Cons
                       </h4>
                       <div className="space-y-2">
                          {evidence.red_flags.map((flag, i) => (
                            <EvidenceItemWithFeedback key={`red-${i}`} content={flag} itemType="red_flags" itemIndex={i} jobId={jobId} candidateId={candidate.id} variant="red" />
                          ))}
                       </div>
                     </div>
                   )}
                   
                   {evidence.signals && evidence.signals.length > 0 && (
                     <div className="space-y-2">
                       <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                         <Info className="h-3.5 w-3.5" /> Signals
                       </h4>
                       <div className="space-y-2">
                          {evidence.signals.map((signal, i) => (
                            <EvidenceItemWithFeedback key={`signal-${i}`} content={signal} itemType="signals" itemIndex={i} jobId={jobId} candidateId={candidate.id} variant="neutral" />
                          ))}
                       </div>
                     </div>
                   )}
                </div>
             </div>

             <div className="flex items-center justify-end pt-2">
                <Button variant="ghost" size="sm" onClick={handleRegenerate} disabled={isRegenerating} className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                  <RefreshCw className={cn("h-3 w-3", isRegenerating && "animate-spin")} />
                  Regenerate Analysis
                </Button>
             </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="p-4 bg-muted/10 border-t border-border/50 flex items-center justify-between gap-4">
         <div className="flex items-center gap-2">
           <Button 
             variant="ghost" 
             size="sm" 
             className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
             onClick={() => trackAction("reject")}
             disabled={actionLoading !== null || isRejected}
           >
             <X className="h-4 w-4 mr-2" />
             Pass
           </Button>
           <FindSimilarButton candidateId={candidate.id} jobId={jobId} candidateName={candidate.display_name || candidate.github_username || "this candidate"} />
         </div>
         
         <div className="flex items-center gap-2">
           <ContactDialog
             candidate={candidate}
             jobTitle={jobTitle}
             outreachHook={evidence?.outreach_hook}
             onContact={() => trackAction("contact")}
             trigger={
               <Button 
                 variant="outline" 
                 size="sm"
                 className="bg-background hover:bg-secondary/50 border-border"
                 disabled={actionLoading !== null}
               >
                 <Mail className="h-4 w-4 mr-2" />
                 Contact
               </Button>
             }
           />
           <Button 
             variant={isShortlisted ? "secondary" : "default"}
             size="sm"
             className={cn(isShortlisted ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-900 dark:text-emerald-100" : "bg-primary text-primary-foreground hover:bg-primary/90")}
             onClick={() => trackAction("shortlist")}
             disabled={actionLoading !== null || isShortlisted}
           >
             <Check className="h-4 w-4 mr-2" />
             {isShortlisted ? "Shortlisted" : "Shortlist"}
           </Button>
         </div>
      </CardFooter>
    </Card>
  )
}

// --- Main Page Component ---

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = params.id as string

  const [job, setJob] = useState<Job | null>(null)
  const [candidates, setCandidates] = useState<JobCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  
  // Pipeline state
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineStep, setPipelineStep] = useState<string | null>(null)
  const [pipelineProgress, setPipelineProgress] = useState(0)
  
  // Sourcing state
  const [sourcingOpen, setSourcingOpen] = useState(false)
  const [sourcingQuery, setSourcingQuery] = useState("")
  const [sourcingCount, setSourcingCount] = useState(15)
  const [sourcingLocation, setSourcingLocation] = useState("")
  const [sourcingLanguage, setSourcingLanguage] = useState("")
  const [sourcingLoading, setSourcingLoading] = useState(false)
  
  // Filter state
  const [stageFilter, setStageFilter] = useState<PipelineStage>("all")
  
  // Fullscreen viewer state
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null)

  const fetchJob = useCallback(async () => {
    try {
      const data = await jobsApi.get(jobId)
      setJob(data)
    } catch {
      toast.error("Failed to load job")
    }
  }, [jobId])

  const fetchCandidates = useCallback(async () => {
    try {
      setLoadingCandidates(true)
      const data = await jobsApi.getCandidates(jobId, 100)
      setCandidates(data)
    } catch {
      toast.error("Failed to load candidates")
    } finally {
      setLoadingCandidates(false)
    }
  }, [jobId])

  useEffect(() => {
    async function init() {
      setLoading(true)
      await fetchJob()
      await fetchCandidates()
      setLoading(false)
    }
    init()
  }, [fetchJob, fetchCandidates])

  useEffect(() => {
    if (job && !sourcingQuery) {
      setSourcingQuery(job.title.toLowerCase())
    }
  }, [job, sourcingQuery])

  const pollTask = async (taskId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        try {
          const status = await fetch(`http://localhost:8000/tasks/${taskId}`).then((r) => r.json())
          if (status.status === "SUCCESS") {
            clearInterval(interval)
            resolve(true)
          } else if (status.status === "FAILURE") {
            clearInterval(interval)
            resolve(false)
          }
        } catch {
          clearInterval(interval)
          resolve(false)
        }
      }, 2000)
    })
  }

  const runFullPipeline = async () => {
    if (candidates.length === 0) {
      toast.error("No candidates to process")
      return
    }

    setPipelineRunning(true)
    setPipelineProgress(0)

    try {
      setPipelineStep("Enriching...")
      setPipelineProgress(10)
      const enrichResult = await jobsApi.enrich(jobId)
      await pollTask(enrichResult.task_id)
      setPipelineProgress(33)

      setPipelineStep("Scoring...")
      const scoreResult = await jobsApi.calculateScores(jobId)
      await pollTask(scoreResult.task_id)
      setPipelineProgress(66)

      setPipelineStep("Generating evidence...")
      const evidenceResult = await jobsApi.generateEvidence(jobId)
      await pollTask(evidenceResult.task_id)
      setPipelineProgress(100)

      toast.success("Pipeline complete!")
      await fetchCandidates()
    } catch {
      toast.error("Pipeline failed")
    } finally {
      setPipelineRunning(false)
      setPipelineStep(null)
      setPipelineProgress(0)
    }
  }

  const handleSourceGitHub = async () => {
    if (!sourcingQuery.trim()) {
      toast.error("Enter a search query")
      return
    }

    setSourcingLoading(true)
    try {
      const request: GitHubSourceRequest = {
        search_query: sourcingQuery,
        max_results: sourcingCount,
        min_followers: 10,
        min_repos: 5,
        min_dev_score: 50,
        location: sourcingLocation || undefined,
        language: sourcingLanguage || undefined,
      }
      const result = await jobsApi.sourceGitHub(jobId, request)
      toast.success(`Sourcing ${sourcingCount} candidates...`)
      
      const success = await pollTask(result.task_id)
      if (success) {
        toast.success("Sourcing complete! Candidates added to your list.")
        await fetchCandidates()
        setSourcingOpen(false)
      }
    } catch {
      toast.error("Sourcing failed")
    } finally {
      setSourcingLoading(false)
    }
  }

  const filteredCandidates = candidates
    .filter((jc) => {
      if (stageFilter === "all") return true
      return jc.status === stageFilter
    })
    .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))

  const stats = {
    total: candidates.length,
    shortlisted: candidates.filter((c) => c.status === CandidateStatus.SHORTLISTED).length,
    rejected: candidates.filter((c) => c.status === CandidateStatus.REJECTED).length,
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-8 space-y-8">
        <div className="space-y-4">
          <Skeleton className="h-12 w-1/3" />
          <Skeleton className="h-6 w-1/4" />
        </div>
        <div className="space-y-6">
           {[1, 2, 3].map(i => <Skeleton key={i} className="h-[400px] w-full rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (!job) return <div className="p-8 text-center">Job not found</div>

  return (
    <div className="min-h-screen bg-muted/5">
      {/* Sticky Header - positioned below main nav */}
      <header className="sticky top-14 z-30 bg-background/95 backdrop-blur-xl border-b border-border/50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => router.push("/jobs")} className="-ml-2 h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-lg font-bold leading-none tracking-tight flex items-center gap-2">
                   {job.title}
                </h1>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                   <Briefcase className="h-3 w-3" /> {job.keywords?.slice(0, 3).join(", ")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <SemanticSearch jobId={jobId} triggerClassName="h-9" />
              <Sheet open={sourcingOpen} onOpenChange={setSourcingOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    <Search className="h-4 w-4 mr-2" />
                    Source
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Source from GitHub</SheetTitle>
                    <SheetDescription>Find developers matching your requirements</SheetDescription>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto px-4">
                    <div className="space-y-4 py-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Search Query</label>
                        <Input value={sourcingQuery} onChange={(e) => setSourcingQuery(e.target.value)} placeholder="e.g. machine learning engineer" />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">Location</label>
                        <Input value={sourcingLocation} onChange={(e) => setSourcingLocation(e.target.value)} placeholder="e.g. San Francisco, USA, Remote" />
                        <p className="text-xs text-muted-foreground mt-1">Filter by location (city, country, or region)</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">Programming Language</label>
                        <Input value={sourcingLanguage} onChange={(e) => setSourcingLanguage(e.target.value)} placeholder="e.g. python, swift, typescript" />
                        <p className="text-xs text-muted-foreground mt-1">Filter by primary programming language</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">Quantity</label>
                        <Input type="number" min={1} max={50} value={sourcingCount} onChange={(e) => setSourcingCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} />
                      </div>
                    </div>
                  </div>
                  <SheetFooter>
                    <Button onClick={handleSourceGitHub} disabled={sourcingLoading} className="w-full">
                      {sourcingLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Github className="h-4 w-4 mr-2" />}
                      {sourcingLoading ? "Searching..." : "Find Candidates"}
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className={cn("h-9", pipelineRunning ? "bg-muted text-foreground" : "bg-primary text-primary-foreground")}>
                     {pipelineRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2 fill-current" />}
                     {pipelineRunning ? pipelineStep : "AI Pipeline"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                   <DropdownMenuItem onClick={runFullPipeline} disabled={pipelineRunning || candidates.length === 0}>
                      <Zap className="h-4 w-4 mr-2 text-indigo-500" />
                      Run Analysis & Scoring
                   </DropdownMenuItem>
                   <DropdownMenuItem onClick={fetchCandidates} disabled={loadingCandidates}>
                      <RefreshCw className={cn("h-4 w-4 mr-2", loadingCandidates && "animate-spin")} />
                      Refresh Data
                   </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {pipelineRunning && <Progress value={pipelineProgress} className="h-0.5 absolute bottom-0 left-0 right-0 rounded-none" />}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* 🧠 Learning Indicator */}
        <LearningIndicator jobId={jobId} showDetails={true} />

        {/* 🔍 Search Strategy */}
        <SearchStrategyCard 
          jobId={jobId} 
          jobTitle={job.title}
          initialStrategy={job.search_strategy}
        />

        {/* Stats & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
           <Tabs value={stageFilter} onValueChange={(v) => setStageFilter(v as PipelineStage)} className="w-full sm:w-auto">
              <TabsList className="grid w-full grid-cols-3 sm:w-auto">
                 <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
                 <TabsTrigger value="shortlisted">Shortlist ({stats.shortlisted})</TabsTrigger>
                 <TabsTrigger value="rejected">Rejected ({stats.rejected})</TabsTrigger>
              </TabsList>
           </Tabs>
           
           <div className="text-sm text-muted-foreground hidden sm:block">
              Showing {filteredCandidates.length} candidates
           </div>
        </div>

        {/* Candidates Feed */}
        <AnimatePresence mode="popLayout">
          <motion.div className="space-y-6">
            {filteredCandidates.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-20 border-2 border-dashed rounded-xl bg-background/50 gradient-card"
              >
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                </motion.div>
                <h3 className="text-lg font-medium">No candidates found</h3>
                <p className="text-muted-foreground mt-1">
                  {candidates.length === 0 ? "Source candidates to get started." : "Adjust your filters to see more."}
                </p>
                {candidates.length === 0 && (
                  <Button variant="outline" onClick={() => setSourcingOpen(true)} className="mt-4">
                    Source Candidates
                  </Button>
                )}
              </motion.div>
            ) : (
              filteredCandidates.map((jc, index) => (
                <motion.div
                  key={jc.id}
                  custom={index}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  layout
                  onClick={() => setFullscreenIndex(index)}
                  className="cursor-pointer"
                >
                  <CandidateCard jc={jc} jobId={jobId} jobTitle={job.title} onAction={fetchCandidates} />
                </motion.div>
              ))
            )}
          </motion.div>
        </AnimatePresence>

        {/* Fullscreen Candidate Viewer */}
        <AnimatePresence>
          {fullscreenIndex !== null && (
            <CandidateFullscreenViewer
              candidates={filteredCandidates}
              initialIndex={fullscreenIndex}
              jobId={jobId}
              jobTitle={job.title}
              onClose={() => setFullscreenIndex(null)}
              onAction={fetchCandidates}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
