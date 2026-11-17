"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Eye, EyeOff, Mail, Lock, AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { googleOAuthEnabled } from "@/config/auth";
import { GoogleLoginButton } from "./GoogleLoginButton";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, { message: "Identifier is required" })
    .transform((val) => val.trim()),
  password: z.string().min(1, { message: "Password is required" }),
  rememberMe: z.boolean().default(false).optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export interface LoginFormProps {
  defaultEmail?: string;
  onSubmit: (data: LoginFormValues) => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
  className?: string;
  showSocial?: boolean;
}

export function LoginForm({
  defaultEmail = "",
  onSubmit,
  loading = false,
  error = null,
  disabled = false,
  className,
  showSocial = true,
}: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: defaultEmail,
      password: "",
      rememberMe: false,
    },
  });

  const handleSubmit = async (data: LoginFormValues) => {
    form.clearErrors("root");
    try {
      await onSubmit(data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Invalid credentials. Please try again.";
      form.setError("root", {
        type: "manual",
        message: errorMessage,
      });
    }
  };

  const isSubmitting = loading || form.formState.isSubmitting || googleLoading;
  const isDisabled = disabled || isSubmitting;
  const rootError = error || form.formState.errors.root?.message;

  return (
    <div className={cn("w-full space-y-5", className)}>
      {rootError && (
        <div className="p-3.5 bg-red-500/10 border border-red-500/25 rounded-xl flex items-start gap-2.5 text-red-600 dark:text-red-400 text-xs sm:text-sm animate-in fade-in slide-in-from-top-1">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{rootError}</span>
        </div>
      )}

      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        {/* Email/UID Field */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-semibold text-foreground tracking-wide">
            Email or UID
          </label>
          <div className="relative group">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              id="email"
              type="text"
              placeholder="name@example.com or UID"
              className={cn(
                "w-full h-11 px-4 pl-10 rounded-xl border border-input/80 bg-background/90 text-foreground placeholder:text-muted-foreground/60 shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all sm:text-sm",
                form.formState.errors.email ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : "border-input"
              )}
              {...form.register("email")}
              disabled={isDisabled}
              aria-invalid={!!form.formState.errors.email}
              aria-describedby={form.formState.errors.email ? "email-error" : undefined}
            />
          </div>
          {form.formState.errors.email && (
            <p id="email-error" className="text-xs text-red-500 font-medium animate-in fade-in">
              {form.formState.errors.email.message}
            </p>
          )}
        </div>

        {/* Password Field */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-semibold text-foreground tracking-wide">
            Password
          </label>
          <div className="relative group">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••••••"
              className={cn(
                "w-full h-11 px-4 pl-10 pr-10 rounded-xl border border-input/80 bg-background/90 text-foreground placeholder:text-muted-foreground/60 shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all sm:text-sm",
                form.formState.errors.password ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : "border-input"
              )}
              {...form.register("password")}
              disabled={isDisabled}
              aria-invalid={!!form.formState.errors.password}
              aria-describedby={form.formState.errors.password ? "password-error" : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isDisabled}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground focus:outline-none focus:text-primary transition-colors rounded-lg hover:bg-muted/60"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          {form.formState.errors.password && (
            <p id="password-error" className="text-xs text-red-500 font-medium animate-in fade-in">
              {form.formState.errors.password.message}
            </p>
          )}
        </div>

        {/* Remember Me & Forgot Password */}
        <div className="flex items-start justify-between gap-2 pt-0.5 pb-1">
          <div className="flex items-start space-x-2">
            <input
              id="rememberMe"
              type="checkbox"
              className="w-4 h-4 mt-0.5 rounded border-gray-300 text-primary focus:ring-primary/20 transition-colors cursor-pointer accent-primary"
              {...form.register("rememberMe")}
              disabled={isDisabled}
            />
            <div className="flex flex-col">
              <label
                htmlFor="rememberMe"
                className="text-xs font-medium leading-tight peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-foreground cursor-pointer select-none"
              >
                Remember me on this computer
              </label>
              <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Leave unchecked on college lab / shared computers
              </span>
            </div>
          </div>
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors whitespace-nowrap shrink-0"
            tabIndex={-1}
          >
            Forgot password?
          </Link>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          className="w-full h-11 rounded-xl font-bold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.99] transition-all duration-200 text-sm group"
          disabled={isDisabled}
        >
          {isSubmitting ? (
            <>
              <Spinner className="w-4 h-4 mr-2" />
              Signing in...
            </>
          ) : (
            <>
              Sign In <ArrowRight className="w-4 h-4 ml-2 transition-transform duration-200 group-hover:translate-x-1" />
            </>
          )}
        </Button>
      </form>

      {/* Social Login Options */}
      {showSocial && googleOAuthEnabled && (
        <div className="space-y-4 pt-1">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/80" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase">
              <span className="bg-card px-2.5 text-muted-foreground font-semibold tracking-wider">
                Or continue with
              </span>
            </div>
          </div>

          <div className="grid gap-3 grid-cols-1">
            <GoogleLoginButton
              disabled={isDisabled}
              loading={googleLoading}
              onLoadingChange={setGoogleLoading}
              onStart={() => form.clearErrors("root")}
              onError={(message) => form.setError("root", { type: "manual", message })}
            />
          </div>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground pt-1">
        Accounts are created by your institution administrator.
      </p>
    </div>
  );
}
