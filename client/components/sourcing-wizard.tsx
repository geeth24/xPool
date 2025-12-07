"use client"

import * as React from "react"
import { useState, useCallback, useMemo, useEffect } from "react"
import { Check, ChevronRight, MapPin, Code2, Briefcase, Sparkles, Globe, Building2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { jobsApi, Job, SearchStrategy } from "@/lib/api"
import { toast } from "sonner"

export interface SourcingConfig {
  roleType: string
  customRole?: string
  location: string
  customLocation?: string
  skills: string[]
  customSkills?: string[]
  candidateCount: number
  experienceLevel: string
  jobId?: string
}

interface SourcingWizardProps {
  onComplete: (config: SourcingConfig) => void
  onCancel?: () => void
  preselectedJobId?: string
}

type Step = "job" | "role" | "location" | "skills" | "count" | "experience" | "confirm"

const ROLE_OPTIONS = [
  { value: "ml_engineer", label: "ML/AI Engineer", icon: <Sparkles className="size-4" />, keywords: ["machine learning", "deep learning", "pytorch", "tensorflow"] },
  { value: "backend", label: "Backend Engineer", icon: <Code2 className="size-4" />, keywords: ["api", "microservices", "databases", "scalability"] },
  { value: "frontend", label: "Frontend Engineer", icon: <Globe className="size-4" />, keywords: ["react", "vue", "typescript", "ui/ux"] },
  { value: "fullstack", label: "Full Stack Engineer", icon: <Code2 className="size-4" />, keywords: ["frontend", "backend", "full-stack"] },
  { value: "ios", label: "iOS Engineer", icon: <Code2 className="size-4" />, keywords: ["swift", "swiftui", "ios", "mobile"] },
  { value: "android", label: "Android Engineer", icon: <Code2 className="size-4" />, keywords: ["kotlin", "android", "mobile"] },
  { value: "devops", label: "DevOps/SRE", icon: <Building2 className="size-4" />, keywords: ["kubernetes", "docker", "ci/cd", "infrastructure"] },
  { value: "data", label: "Data Engineer", icon: <Code2 className="size-4" />, keywords: ["spark", "airflow", "etl", "data pipelines"] },
  { value: "custom", label: "Other (specify)", icon: <Briefcase className="size-4" />, keywords: [] },
]

const LOCATION_OPTIONS = [
  { value: "remote", label: "Remote (Global)", icon: <Globe className="size-4" /> },
  { value: "us", label: "United States", icon: <MapPin className="size-4" /> },
  { value: "sf_bay", label: "San Francisco Bay Area", icon: <MapPin className="size-4" /> },
  { value: "nyc", label: "New York City", icon: <MapPin className="size-4" /> },
  { value: "europe", label: "Europe", icon: <MapPin className="size-4" /> },
  { value: "uk", label: "United Kingdom", icon: <MapPin className="size-4" /> },
  { value: "india", label: "India", icon: <MapPin className="size-4" /> },
  { value: "canada", label: "Canada", icon: <MapPin className="size-4" /> },
  { value: "custom", label: "Other location...", icon: <MapPin className="size-4" /> },
]

const SKILL_OPTIONS: Record<string, { label: string; skills: string[] }> = {
  ml_engineer: { label: "ML/AI Skills", skills: ["Python", "PyTorch", "TensorFlow", "Transformers", "LLMs", "Computer Vision", "NLP", "MLOps", "Scikit-learn", "JAX"] },
  backend: { label: "Backend Skills", skills: ["Python", "Go", "Java", "Node.js", "PostgreSQL", "Redis", "Kafka", "gRPC", "REST APIs", "GraphQL"] },
  frontend: { label: "Frontend Skills", skills: ["React", "TypeScript", "Next.js", "Vue", "Tailwind CSS", "CSS", "JavaScript", "Svelte", "Redux", "Testing"] },
  fullstack: { label: "Full Stack Skills", skills: ["React", "Node.js", "TypeScript", "PostgreSQL", "Python", "Docker", "AWS", "GraphQL", "MongoDB", "Redis"] },
  ios: { label: "iOS Skills", skills: ["Swift", "SwiftUI", "UIKit", "Combine", "Core Data", "Objective-C", "Xcode", "TestFlight", "App Store", "ARKit"] },
  android: { label: "Android Skills", skills: ["Kotlin", "Jetpack Compose", "Android SDK", "Java", "Coroutines", "Room", "Retrofit", "MVVM", "Firebase", "Play Store"] },
  devops: { label: "DevOps Skills", skills: ["Kubernetes", "Docker", "Terraform", "AWS", "GCP", "CI/CD", "Linux", "Prometheus", "Ansible", "GitOps"] },
  data: { label: "Data Engineering Skills", skills: ["Python", "Spark", "Airflow", "SQL", "dbt", "Snowflake", "Databricks", "Kafka", "ETL", "Data Modeling"] },
  custom: { label: "Skills", skills: ["Python", "JavaScript", "TypeScript", "Go", "Rust", "Java", "C++", "React", "Node.js", "AWS"] },
}

const COUNT_OPTIONS = [
  { value: 10, label: "10 candidates", description: "Quick search" },
  { value: 25, label: "25 candidates", description: "Standard search" },
  { value: 50, label: "50 candidates", description: "Deep search" },
  { value: 100, label: "100 candidates", description: "Comprehensive" },
]

const EXPERIENCE_OPTIONS = [
  { value: "any", label: "Any experience", description: "All levels" },
  { value: "junior", label: "Junior (0-2 years)", description: "Entry level" },
  { value: "mid", label: "Mid-level (3-5 years)", description: "Some experience" },
  { value: "senior", label: "Senior (5+ years)", description: "Experienced" },
  { value: "staff", label: "Staff+ (8+ years)", description: "Leadership track" },
]


export function SourcingWizard({ onComplete, onCancel, preselectedJobId }: SourcingWizardProps) {
  const [step, setStep] = useState<Step>(preselectedJobId ? "role" : "job")
  const [config, setConfig] = useState<Partial<SourcingConfig>>({
    skills: [],
    candidateCount: 25,
    experienceLevel: "any",
    jobId: preselectedJobId,
  })
  const [customInput, setCustomInput] = useState("")
  const [customSkillInput, setCustomSkillInput] = useState("")
  
  // Job selection and AI strategy
  const [jobs, setJobs] = useState<Job[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [loadingStrategy, setLoadingStrategy] = useState(false)
  const [aiStrategy, setAiStrategy] = useState<SearchStrategy | null>(null)

  // Load jobs on mount
  useEffect(() => {
    async function fetchJobs() {
      setLoadingJobs(true)
      try {
        const data = await jobsApi.list()
        setJobs(data)
      } catch {
        toast.error("Failed to load jobs")
      } finally {
        setLoadingJobs(false)
      }
    }
    fetchJobs()
  }, [])

  // Load strategy when job is selected
  useEffect(() => {
    async function loadStrategy(jobId: string) {
      setLoadingStrategy(true)
      try {
        const result = await jobsApi.getSearchStrategy(jobId)
        if (result.search_strategy) {
          const strategy = result.search_strategy
          setAiStrategy(strategy)
          // auto-fill skills from strategy
          if (strategy.bio_keywords?.length > 0) {
            setConfig(prev => ({
              ...prev,
              skills: strategy.bio_keywords.slice(0, 5)
            }))
          }
          // auto-detect role type
          if (strategy.role_type && strategy.role_type !== "unknown") {
            setConfig(prev => ({
              ...prev,
              roleType: strategy.role_type
            }))
          }
        }
      } catch {
        // no strategy yet
      } finally {
        setLoadingStrategy(false)
      }
    }
    
    if (config.jobId) {
      loadStrategy(config.jobId)
    }
  }, [config.jobId])

  const steps = useMemo<Step[]>(() => preselectedJobId 
    ? ["role", "location", "skills", "count", "experience", "confirm"]
    : ["job", "role", "location", "skills", "count", "experience", "confirm"], [preselectedJobId])
  const currentStepIndex = steps.indexOf(step)
  const progress = ((currentStepIndex + 1) / steps.length) * 100

  const handleNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex])
      setCustomInput("")
    }
  }, [currentStepIndex, steps])

  const handleBack = useCallback(() => {
    const prevIndex = currentStepIndex - 1
    if (prevIndex >= 0) {
      setStep(steps[prevIndex])
    }
  }, [currentStepIndex, steps])

  const handleSelect = useCallback((key: keyof SourcingConfig, value: string | number | string[] | boolean) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleSkillToggle = useCallback((skill: string) => {
    setConfig(prev => {
      const skills = prev.skills || []
      if (skills.includes(skill)) {
        return { ...prev, skills: skills.filter(s => s !== skill) }
      }
      return { ...prev, skills: [...skills, skill] }
    })
  }, [])

  const handleAddCustomSkill = useCallback(() => {
    if (customSkillInput.trim()) {
      setConfig(prev => ({
        ...prev,
        skills: [...(prev.skills || []), customSkillInput.trim()],
        customSkills: [...(prev.customSkills || []), customSkillInput.trim()]
      }))
      setCustomSkillInput("")
    }
  }, [customSkillInput])

  const handleComplete = useCallback(() => {
    if (config.roleType && config.location) {
      onComplete(config as SourcingConfig)
    }
  }, [config, onComplete])

  const renderStepContent = () => {
    switch (step) {
      case "job":
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">Which job are you sourcing for?</h3>
              <p className="text-sm text-muted-foreground">Select a job to auto-load AI search tags</p>
            </div>
            {loadingJobs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {jobs.map(job => (
                  <button
                    key={job.id}
                    onClick={() => {
                      setConfig(prev => ({ ...prev, jobId: job.id }))
                      handleNext()
                    }}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border text-left transition-all w-full",
                      config.jobId === job.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                    )}
                  >
                    <Briefcase className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm block">{job.title}</span>
                      {job.keywords && job.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {job.keywords.slice(0, 3).map(k => (
                            <Badge key={k} variant="secondary" className="text-[10px] h-5">{k}</Badge>
                          ))}
                        </div>
                      )}
                      {job.search_strategy && (
                        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-emerald-600">
                          <Sparkles className="size-3" />
                          AI strategy ready
                        </div>
                      )}
                    </div>
                    {config.jobId === job.id && (
                      <Check className="size-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
                {jobs.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Briefcase className="size-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No jobs found</p>
                    <p className="text-xs">Create a job first to start sourcing</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )

      case "role":
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">What role are you hiring for?</h3>
              <p className="text-sm text-muted-foreground">Select the type of engineer you&apos;re looking for</p>
            </div>
            
            {/* AI Strategy loaded indicator */}
            {aiStrategy && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                <Sparkles className="size-4" />
                <span className="text-xs font-medium">AI search strategy loaded</span>
                {loadingStrategy && <Loader2 className="size-3 animate-spin" />}
              </div>
            )}

            {/* Auto-detected role from AI */}
            {aiStrategy?.role_type && aiStrategy.role_type !== "unknown" && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Check className="size-3 text-emerald-500" />
                AI detected: <span className="font-medium capitalize">{aiStrategy.role_type.replace(/_/g, " ")}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ROLE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => {
                    handleSelect("roleType", option.value)
                    if (option.value !== "custom") {
                      handleNext()
                    }
                  }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                    config.roleType === option.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  <span className="text-muted-foreground">{option.icon}</span>
                  <span className="font-medium text-sm">{option.label}</span>
                  {config.roleType === option.value && (
                    <Check className="size-4 ml-auto text-primary" />
                  )}
                </button>
              ))}
            </div>
            {config.roleType === "custom" && (
              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="e.g., Blockchain Engineer, QA Engineer..."
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customInput.trim()) {
                      handleSelect("customRole", customInput.trim())
                      handleNext()
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={() => {
                    if (customInput.trim()) {
                      handleSelect("customRole", customInput.trim())
                      handleNext()
                    }
                  }}
                  disabled={!customInput.trim()}
                >
                  Continue
                </Button>
              </div>
            )}
          </div>
        )

      case "location":
        const aiLocations = aiStrategy?.location_suggestions || []
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">Where should candidates be located?</h3>
              <p className="text-sm text-muted-foreground">Select preferred location or timezone</p>
            </div>
            
            {/* AI-suggested locations */}
            {aiLocations.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="size-3 text-primary" />
                  <span>AI-suggested locations for this role</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {aiLocations.map(loc => (
                    <button
                      key={`ai-loc-${loc}`}
                      onClick={() => {
                        handleSelect("location", "custom")
                        handleSelect("customLocation", loc)
                        handleNext()
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-sm font-medium hover:bg-primary/10 transition-all"
                    >
                      <MapPin className="size-3 text-primary" />
                      <span className="capitalize">{loc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {LOCATION_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => {
                    handleSelect("location", option.value)
                    if (option.value !== "custom") {
                      handleNext()
                    }
                  }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                    config.location === option.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  <span className="text-muted-foreground">{option.icon}</span>
                  <span className="font-medium text-sm">{option.label}</span>
                  {config.location === option.value && (
                    <Check className="size-4 ml-auto text-primary" />
                  )}
                </button>
              ))}
            </div>
            {config.location === "custom" && (
              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="e.g., Austin TX, Berlin, Singapore..."
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customInput.trim()) {
                      handleSelect("customLocation", customInput.trim())
                      handleNext()
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={() => {
                    if (customInput.trim()) {
                      handleSelect("customLocation", customInput.trim())
                      handleNext()
                    }
                  }}
                  disabled={!customInput.trim()}
                >
                  Continue
                </Button>
              </div>
            )}
          </div>
        )

      case "skills":
        const roleSkills = SKILL_OPTIONS[config.roleType || "custom"]
        // combine AI-generated skills with role-based skills
        const aiSkills = aiStrategy?.bio_keywords || []
        const aiTopics = aiStrategy?.repo_topics || []
        const combinedAiSkills = [...new Set([...aiSkills, ...aiTopics])].slice(0, 12)
        const hasAiSkills = combinedAiSkills.length > 0
        
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">What skills are important?</h3>
              <p className="text-sm text-muted-foreground">Select must-have skills (pick 3-5 for best results)</p>
            </div>
            
            {/* AI-generated skills section */}
            {hasAiSkills && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="size-3 text-primary" />
                  <span>AI-recommended for this job</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {combinedAiSkills.map(skill => (
                    <button
                      key={`ai-${skill}`}
                      onClick={() => handleSkillToggle(skill)}
                      className={cn(
                        "px-3 py-1.5 rounded-full border text-sm font-medium transition-all",
                        config.skills?.includes(skill)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary"
                      )}
                    >
                      {skill}
                      {config.skills?.includes(skill) && (
                        <Check className="size-3 ml-1.5 inline" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Standard role-based skills */}
            <div className="space-y-2">
              {hasAiSkills && (
                <div className="text-xs text-muted-foreground">Or choose from common skills:</div>
              )}
              <div className="flex flex-wrap gap-2">
                {roleSkills.skills.filter(s => !combinedAiSkills.includes(s)).map(skill => (
                  <button
                    key={skill}
                    onClick={() => handleSkillToggle(skill)}
                    className={cn(
                      "px-3 py-1.5 rounded-full border text-sm font-medium transition-all",
                      config.skills?.includes(skill)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                    )}
                  >
                    {skill}
                    {config.skills?.includes(skill) && (
                      <Check className="size-3 ml-1.5 inline" />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Input
                placeholder="Add custom skill..."
                value={customSkillInput}
                onChange={(e) => setCustomSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleAddCustomSkill()
                  }
                }}
                className="flex-1"
              />
              <Button variant="outline" onClick={handleAddCustomSkill} disabled={!customSkillInput.trim()}>
                Add
              </Button>
            </div>
            {config.skills && config.skills.length > 0 && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">Selected: {config.skills.length} skills</p>
                <Button onClick={handleNext}>
                  Continue with {config.skills.length} skills
                  <ChevronRight className="size-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        )

      case "count":
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">How many candidates do you need?</h3>
              <p className="text-sm text-muted-foreground">More candidates = longer search time</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {COUNT_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => {
                    handleSelect("candidateCount", option.value)
                    handleNext()
                  }}
                  className={cn(
                    "flex flex-col items-start p-4 rounded-lg border text-left transition-all",
                    config.candidateCount === option.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  <span className="font-semibold text-lg">{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </button>
              ))}
            </div>
          </div>
        )

      case "experience":
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">What experience level?</h3>
              <p className="text-sm text-muted-foreground">Filter by years of experience</p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {EXPERIENCE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => {
                    handleSelect("experienceLevel", option.value)
                    handleNext()
                  }}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border text-left transition-all",
                    config.experienceLevel === option.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  <div>
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">{option.description}</span>
                  </div>
                  {config.experienceLevel === option.value && (
                    <Check className="size-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )

      case "confirm":
        const roleLabel = ROLE_OPTIONS.find(r => r.value === config.roleType)?.label || config.customRole || config.roleType
        const locationLabel = LOCATION_OPTIONS.find(l => l.value === config.location)?.label || config.customLocation || config.location
        const selectedJobForConfirm = jobs.find(j => j.id === config.jobId)
        
        return (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">Ready to start sourcing?</h3>
              <p className="text-sm text-muted-foreground">Review your search criteria</p>
            </div>
            
            {/* AI Strategy indicator */}
            {aiStrategy && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                <Sparkles className="size-4" />
                <span className="text-xs font-medium">Using AI-optimized search strategy</span>
              </div>
            )}
            
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              {selectedJobForConfirm && (
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-sm text-muted-foreground">Job</span>
                  <span className="font-medium text-sm">{selectedJobForConfirm.title}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Role</span>
                <span className="font-medium">{roleLabel}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Location</span>
                <span className="font-medium">{locationLabel}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-sm text-muted-foreground">Skills</span>
                <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                  {config.skills?.slice(0, 5).map(skill => (
                    <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
                  ))}
                  {(config.skills?.length || 0) > 5 && (
                    <Badge variant="outline" className="text-xs">+{(config.skills?.length || 0) - 5}</Badge>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Candidates</span>
                <span className="font-medium">{config.candidateCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Experience</span>
                <span className="font-medium">{EXPERIENCE_OPTIONS.find(e => e.value === config.experienceLevel)?.label}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Source</span>
                <span className="font-medium flex items-center gap-1.5">
                  <Code2 className="size-3.5" />
                  GitHub
                </span>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                Edit
              </Button>
              <Button onClick={handleComplete} className="flex-1">
                <Sparkles className="size-4 mr-2" />
                Start Sourcing
              </Button>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="w-full max-w-xl rounded-xl border bg-background/95 backdrop-blur-sm overflow-hidden">
      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div 
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Content */}
      <div className="p-5">
        {renderStepContent()}
      </div>

      {/* Footer navigation */}
      {step !== "confirm" && step !== "role" && (
        <div className="px-5 pb-4 flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            ← Back
          </Button>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

