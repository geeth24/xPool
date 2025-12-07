"use client"

import { useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { candidatesApi } from "@/lib/api"
import { Candidate, VerificationStatus } from "@/lib/api/types"
import {
  CheckCircle2,
  Clock,
  Shield,
  Plus,
  Trash2,
  Github,
  Twitter,
  Mail,
} from "lucide-react"

const proofSchema = z.object({
  type: z.enum(["repo", "project", "blog", "talk"]),
  url: z.string().url("Must be a valid URL"),
  description: z.string().optional(),
})

const claimFormSchema = z.object({
  verification_method: z.enum(["github_oauth", "x_oauth", "email"]),
  email: z.string().email().optional().or(z.literal("")),
  proofs: z.array(proofSchema).min(1, "Add at least one proof"),
  preferred_contact: z.enum(["email", "x_dm", "linkedin"]).optional(),
  open_to_opportunities: z.number().min(0).max(2),
})

type ClaimFormValues = z.infer<typeof claimFormSchema>

interface ClaimProfileDialogProps {
  candidate: Candidate
  verificationStatus?: VerificationStatus
  onClaimed?: () => void
}

export function ClaimProfileDialog({
  candidate,
  verificationStatus,
  onClaimed,
}: ClaimProfileDialogProps) {
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<ClaimFormValues>({
    resolver: zodResolver(claimFormSchema),
    defaultValues: {
      verification_method: "github_oauth",
      email: "",
      proofs: [{ type: "repo", url: "", description: "" }],
      preferred_contact: "email",
      open_to_opportunities: 1,
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "proofs",
  })

  const onSubmit = async (data: ClaimFormValues) => {
    setIsSubmitting(true)
    try {
      await candidatesApi.claimProfile(candidate.id, {
        verification_method: data.verification_method,
        email: data.email || undefined,
        proofs: data.proofs.map((p) => ({
          type: p.type as "repo" | "project" | "blog" | "talk",
          url: p.url,
          description: p.description,
        })),
        preferred_contact: data.preferred_contact,
        open_to_opportunities: data.open_to_opportunities as 0 | 1 | 2,
      })
      toast.success("Profile claim submitted!")
      setOpen(false)
      onClaimed?.()
    } catch (error) {
      toast.error("Failed to submit claim")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isVerified = verificationStatus?.is_verified === 2
  const isPending = verificationStatus?.is_verified === 1

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={isVerified ? "outline" : "default"}
          size="sm"
          className={
            isVerified
              ? "border-emerald-500/30 text-emerald-400"
              : isPending
              ? "border-amber-500/30 text-amber-400"
              : ""
          }
        >
          {isVerified ? (
            <>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Verified
            </>
          ) : isPending ? (
            <>
              <Clock className="h-4 w-4 mr-1" />
              Pending
            </>
          ) : (
            <>
              <Shield className="h-4 w-4 mr-1" />
              Claim Profile
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-cyan-400" />
            Claim Your Profile
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            We found your public profile. Verify ownership and add canonical
            proofs of your work.
          </DialogDescription>
        </DialogHeader>

        {isVerified ? (
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span className="font-medium text-emerald-400">
                Profile Verified
              </span>
            </div>
            <p className="text-sm text-zinc-400">
              Your profile has been verified. Recruiters can see your canonical
              proofs.
            </p>
            {verificationStatus?.proofs && verificationStatus.proofs.length > 0 && (
              <div className="mt-3 space-y-1">
                {verificationStatus.proofs.map((proof, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-[10px]">
                      {proof.type}
                    </Badge>
                    <a
                      href={proof.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:underline truncate"
                    >
                      {proof.url}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Verification Method */}
              <FormField
                control={form.control}
                name="verification_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verify via</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-zinc-800 border-zinc-700">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="github_oauth">
                          <div className="flex items-center gap-2">
                            <Github className="h-4 w-4" />
                            GitHub OAuth
                          </div>
                        </SelectItem>
                        <SelectItem value="x_oauth">
                          <div className="flex items-center gap-2">
                            <Twitter className="h-4 w-4" />
                            X OAuth
                          </div>
                        </SelectItem>
                        <SelectItem value="email">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Email Verification
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              {/* Email */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Email</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="you@example.com"
                        className="bg-zinc-800 border-zinc-700"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Optional. For recruiters to reach out.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Proofs */}
              <div>
                <FormLabel className="mb-2 block">
                  Canonical Proofs (1-2 best examples)
                </FormLabel>
                <div className="space-y-2">
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="flex gap-2 p-2 rounded bg-zinc-800/50 border border-zinc-700"
                    >
                      <FormField
                        control={form.control}
                        name={`proofs.${index}.type`}
                        render={({ field }) => (
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <SelectTrigger className="w-24 bg-zinc-800 border-zinc-700">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="repo">Repo</SelectItem>
                              <SelectItem value="project">Project</SelectItem>
                              <SelectItem value="blog">Blog</SelectItem>
                              <SelectItem value="talk">Talk</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`proofs.${index}.url`}
                        render={({ field }) => (
                          <Input
                            placeholder="https://..."
                            className="flex-1 bg-zinc-800 border-zinc-700"
                            {...field}
                          />
                        )}
                      />
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {fields.length < 3 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() =>
                      append({ type: "repo", url: "", description: "" })
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Proof
                  </Button>
                )}
              </div>

              {/* Open to Opportunities */}
              <FormField
                control={form.control}
                name="open_to_opportunities"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Open to Opportunities</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(parseInt(v))}
                      defaultValue={field.value.toString()}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-zinc-800 border-zinc-700">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">
                          Yes, actively looking
                        </SelectItem>
                        <SelectItem value="2">
                          Passively open
                        </SelectItem>
                        <SelectItem value="0">
                          Not open
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Submit Claim"}
              </Button>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}

