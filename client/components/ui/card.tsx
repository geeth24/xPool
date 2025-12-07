"use client"

import * as React from "react"
import { motion, HTMLMotionProps } from "motion/react"

import { cn } from "@/lib/utils"

type CardProps = Omit<HTMLMotionProps<"div">, "ref"> & {
  className?: string
  glass?: boolean
  animated?: boolean
}

function Card({ className, glass = true, animated = true, ...props }: CardProps) {
  return (
    <motion.div
      data-slot="card"
      initial={animated ? { opacity: 0, y: 10 } : false}
      animate={animated ? { opacity: 1, y: 0 } : undefined}
      transition={animated ? { duration: 0.3, ease: [0.4, 0, 0.2, 1] } : undefined}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className={cn(
        "text-card-foreground flex flex-col gap-4 rounded-xl py-4 transition-all duration-300",
        glass 
          ? "glass-card" 
          : "bg-card border shadow-sm hover:shadow-lg",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-4",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-4 [.border-t]:pt-4", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
