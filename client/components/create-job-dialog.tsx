"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Plus, X, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { jobsApi, JobCreate } from "@/lib/api"
import { toast } from "sonner"

const jobFormSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters"),
  description: z.string().optional(),
  keywords: z.array(z.string()).min(1, "Add at least one keyword"),
  requirements: z.string().optional(),
})

interface CreateJobDialogProps {
  onCreated?: () => void
}

export function CreateJobDialog({ onCreated }: CreateJobDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [keywordInput, setKeywordInput] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [generating, setGenerating] = React.useState(false)

  const form = useForm<z.infer<typeof jobFormSchema>>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: {
      title: "",
      description: "",
      keywords: [],
      requirements: "",
    },
  })

  const keywords = form.watch("keywords")

  const addKeyword = () => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      form.setValue("keywords", [...keywords, keywordInput.trim()])
      setKeywordInput("")
    }
  }

  const removeKeyword = (keyword: string) => {
    form.setValue(
      "keywords",
      keywords.filter((k) => k !== keyword)
    )
  }

  async function generateWithAI() {
    const title = form.getValues("title")
    if (!title || title.length < 2) {
      toast.error("Enter a job title first")
      return
    }

    try {
      setGenerating(true)
      const generated = await jobsApi.generate(title)
      
      form.setValue("description", generated.description)
      form.setValue("keywords", generated.keywords)
      form.setValue("requirements", generated.requirements)
      
      toast.success("Generated job details with Grok AI")
    } catch (error) {
      toast.error("Failed to generate", {
        description: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setGenerating(false)
    }
  }

  async function onSubmit(data: z.infer<typeof jobFormSchema>) {
    try {
      setLoading(true)
      await jobsApi.create(data as JobCreate)
      toast.success("Job created successfully")
      setOpen(false)
      form.reset()
      onCreated?.()
    } catch (error) {
      toast.error("Failed to create job", {
        description: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Create Job
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Create New Job</DialogTitle>
          <DialogDescription>
            Add a new job position to start sourcing candidates.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input placeholder="Senior iOS Developer" {...field} />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={generateWithAI}
                      disabled={generating || !field.value || field.value.length < 2}
                      className="shrink-0"
                      title="Generate with Grok AI"
                    >
                      <Sparkles className={`h-4 w-4 ${generating ? "animate-pulse" : ""}`} />
                    </Button>
                  </div>
                  <FormDescription>
                    Enter a title and click <Sparkles className="inline h-3 w-3" /> to auto-fill with Grok AI
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of the role..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="keywords"
              render={() => (
                <FormItem>
                  <FormLabel>Keywords</FormLabel>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add keyword..."
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          addKeyword()
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={addKeyword}>
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {keywords.map((keyword) => (
                      <Badge
                        key={keyword}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => removeKeyword(keyword)}
                      >
                        {keyword}
                        <X className="ml-1 h-3 w-3" />
                      </Badge>
                    ))}
                  </div>
                  <FormDescription>
                    Press Enter or click Add to add keywords. Click a keyword to
                    remove it.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="requirements"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Requirements</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="5+ years iOS experience, SwiftUI, Combine..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Used by Grok to generate search queries and match scores.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Job"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}


