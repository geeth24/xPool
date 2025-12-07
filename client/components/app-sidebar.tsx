"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "motion/react"
import {
  Briefcase,
  Home,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { NavUser } from "@/components/nav-user"
import { GrokLogo } from "@/components/ui/grok-logo"

const items = [
  {
    title: "Home",
    url: "/",
    icon: Home,
  },
  {
    title: "Grok",
    url: "/chat",
    icon: GrokLogo,
  },
  {
    title: "Jobs",
    url: "/jobs",
    icon: Briefcase,
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" {...props} variant="floating">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/" className="group">
                <motion.div 
                  className="flex aspect-square size-8 items-center justify-center rounded-lg bg-foreground text-background shadow-md font-bold text-sm"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  𝕏
                </motion.div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-bold text-lg">xPool</span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <GrokLogo className="size-2.5" /> Grok-Powered
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider">Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item, index) => {
                const isActive = pathname === item.url || (item.url !== "/" && pathname.startsWith(item.url))
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <SidebarMenuItem>
                      <SidebarMenuButton 
                        asChild 
                        tooltip={item.title}
                      >
                        <Link href={item.url}>
                          <item.icon className={isActive ? "text-foreground !opacity-100" : "opacity-50"} />
                          <span className={isActive ? "font-bold text-foreground" : "text-muted-foreground"}>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </motion.div>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{
          name: "xAI Recruiter",
          email: "xai@x.ai",
          avatar: "",
        }} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

