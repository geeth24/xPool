"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { EvidenceCardComponent } from "@/components/evidence-card"
import { ClaimProfileDialog } from "@/components/claim-profile-dialog"
import {
  Candidate,
  JobCandidate,
  CandidateType,
  VerificationStatus,
  EvidenceCard,
} from "@/lib/api/types"
import { jobsApi, candidatesApi } from "@/lib/api"
import { toast } from "sonner"
import {
  Github,
  Twitter,
  MapPin,
  Users,
  Star,
  Code,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  CheckCircle2,
  Clock,
} from "lucide-react"

interface CandidateDetailCardProps {
  jobCandidate: JobCandidate
  jobId: string
  onAction?: () => void
}

export function CandidateDetailCard({
  jobCandidate,
  jobId,
  onAction,
}: CandidateDetailCardProps) {
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [currentEvidence, setCurrentEvidence] = useState<EvidenceCard | null>(
    jobCandidate.evidence as EvidenceCard | null
  )
  const candidate = jobCandidate.candidate

  useEffect(() => {
    if (candidate?.id) {
      candidatesApi.getVerificationStatus(candidate.id).then(setVerificationStatus).catch(() => {})
    }
  }, [candidate?.id])

  if (!candidate) return null

  const githubProfile = candidate.tweet_analysis?.github_profile as {
    username?: string
    public_repos?: number
    followers?: number
    languages?: Record<string, number>
    top_repos?: Array<{
      name: string
      description?: string
      stars: number
      language?: string
    }>
    developer_score?: number
  } | undefined

  const trackAction = async (action: "shortlist" | "contact" | "reject") => {
    setActionLoading(action)
    try {
      await jobsApi.trackAction(jobId, candidate.id, { action })
      toast.success(`Candidate ${action === "shortlist" ? "shortlisted" : action === "contact" ? "contacted" : "rejected"}`)
      onAction?.()
    } catch {
      toast.error("Failed to track action")
    } finally {
      setActionLoading(null)
    }
  }

  const getAvatarUrl = () => {
    if (candidate.github_username) {
      return `https://unavatar.io/github/${candidate.github_username}`
    }
    if (candidate.x_username) {
      return `https://unavatar.io/twitter/${candidate.x_username.replace("@", "")}`
    }
    return ""
  }

  const isVerified = verificationStatus?.is_verified === 2
  const isPending = verificationStatus?.is_verified === 1

  return (
    <Card className="border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 border-2 border-zinc-700">
              <AvatarImage src={getAvatarUrl()} />
              <AvatarFallback className="bg-zinc-800 text-lg">
                {(candidate.display_name || candidate.github_username || "?")
                  .substring(0, 2)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">
                  {candidate.display_name || candidate.github_username}
                </CardTitle>
                {isVerified && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                )}
                {isPending && (
                  <Clock className="h-4 w-4 text-amber-400" />
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                {candidate.github_username && (
                  <a
                    href={`https://github.com/${candidate.github_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                  >
                    <Github className="h-3.5 w-3.5" />
                    {candidate.github_username}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {candidate.x_username && (
                  <a
                    href={`https://x.com/${candidate.x_username.replace("@", "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                  >
                    <Twitter className="h-3.5 w-3.5" />
                    @{candidate.x_username.replace("@", "")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Match Score */}
          {jobCandidate.match_score !== undefined && jobCandidate.match_score !== null && (
            <div className="text-right">
              <div className="text-2xl font-bold text-cyan-400">
                {Math.round(jobCandidate.match_score)}
              </div>
              <div className="text-xs text-zinc-500">Match Score</div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-3">
          {candidate.location && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <MapPin className="h-4 w-4" />
              {candidate.location}
            </div>
          )}
          {candidate.followers_count > 0 && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Users className="h-4 w-4" />
              {candidate.followers_count.toLocaleString()} followers
            </div>
          )}
          {githubProfile?.public_repos && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Code className="h-4 w-4" />
              {githubProfile.public_repos} repos
            </div>
          )}
          {githubProfile?.developer_score && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Star className="h-4 w-4" />
              Dev Score: {githubProfile.developer_score}
            </div>
          )}
        </div>

        {/* Bio */}
        {candidate.bio && (
          <p className="text-sm text-zinc-300">{candidate.bio}</p>
        )}

        {/* Skills */}
        {candidate.skills_extracted && candidate.skills_extracted.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {candidate.skills_extracted.slice(0, 10).map((skill) => (
              <Badge
                key={skill}
                variant="secondary"
                className="text-xs bg-zinc-800 text-zinc-300"
              >
                {skill}
              </Badge>
            ))}
            {candidate.skills_extracted.length > 10 && (
              <Badge variant="outline" className="text-xs">
                +{candidate.skills_extracted.length - 10} more
              </Badge>
            )}
          </div>
        )}

        {/* Top Languages */}
        {githubProfile?.languages && Object.keys(githubProfile.languages).length > 0 && (
          <div>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              Top Languages
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(githubProfile.languages)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 6)
                .map(([lang, count]) => (
                  <Badge
                    key={lang}
                    variant="outline"
                    className="text-xs bg-violet-500/10 text-violet-300 border-violet-500/20"
                  >
                    {lang}
                  </Badge>
                ))}
            </div>
          </div>
        )}

        <Separator className="bg-zinc-800" />

        {/* Evidence Card */}
        {currentEvidence && (
          <EvidenceCardComponent
            evidence={currentEvidence}
            candidateName={candidate.display_name || candidate.github_username}
            jobId={jobId}
            candidateId={candidate.id}
            onEvidenceUpdated={(newEvidence) => setCurrentEvidence(newEvidence)}
          />
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              onClick={() => trackAction("shortlist")}
              disabled={actionLoading !== null}
            >
              <ThumbsUp className="h-4 w-4 mr-1" />
              {actionLoading === "shortlist" ? "..." : "Shortlist"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
              onClick={() => trackAction("contact")}
              disabled={actionLoading !== null}
            >
              <MessageSquare className="h-4 w-4 mr-1" />
              {actionLoading === "contact" ? "..." : "Contact"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={() => trackAction("reject")}
              disabled={actionLoading !== null}
            >
              <ThumbsDown className="h-4 w-4 mr-1" />
              {actionLoading === "reject" ? "..." : "Reject"}
            </Button>
          </div>

          <ClaimProfileDialog
            candidate={candidate}
            verificationStatus={verificationStatus || undefined}
          />
        </div>
      </CardContent>
    </Card>
  )
}

