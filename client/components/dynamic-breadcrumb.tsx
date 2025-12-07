"use client"

import { usePathname } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

const ROUTE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/chat": "Grok",
  "/jobs": "Jobs",
  "/candidates": "Candidates",
  "/sourcing": "Smart Sourcing",
}

export function DynamicBreadcrumb() {
  const pathname = usePathname()
  
  // Get the current page label
  const getPageLabel = () => {
    // Exact match first
    if (ROUTE_LABELS[pathname]) {
      return ROUTE_LABELS[pathname]
    }
    
    // Check for dynamic routes like /jobs/[id]
    if (pathname.startsWith("/jobs/")) {
      return "Job Details"
    }
    
    if (pathname.startsWith("/candidates/")) {
      return "Candidate Details"
    }
    
    // Fallback to capitalizing the last segment
    const segments = pathname.split("/").filter(Boolean)
    if (segments.length > 0) {
      const last = segments[segments.length - 1]
      return last.charAt(0).toUpperCase() + last.slice(1)
    }
    
    return "Dashboard"
  }

  // Get parent breadcrumb for nested routes
  const getParentBreadcrumb = () => {
    if (pathname.startsWith("/jobs/") && pathname !== "/jobs") {
      return { href: "/jobs", label: "Jobs" }
    }
    if (pathname.startsWith("/candidates/") && pathname !== "/candidates") {
      return { href: "/candidates", label: "Candidates" }
    }
    return null
  }

  const pageLabel = getPageLabel()
  const parent = getParentBreadcrumb()

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            xPool
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:block" />
        
        {parent && (
          <>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href={parent.href} className="text-muted-foreground hover:text-foreground transition-colors">
                {parent.label}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
          </>
        )}
        
        <BreadcrumbItem>
          <BreadcrumbPage className="font-medium">{pageLabel}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

