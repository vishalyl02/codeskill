"use client";

import { Building2, ShieldCheck, Quote } from "lucide-react";
import Image from "next/image";
import { LoginForm, LoginFormValues } from "./LoginForm";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface LoginPageProps {
  redirectUrl?: string;
}

export function LoginPage({ redirectUrl = "/dashboard" }: LoginPageProps) {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async (data: LoginFormValues) => {
    setLoading(true);
    try {
      const input = data.email.trim();
      const res = await login({
        email: input,
        password: data.password,
      });

      if (res?.user?.isAdmin) {
        window.location.href = "/admin/dashboard";
      } else if (res?.user?.isAssessmentStudent) {
        window.location.href = "/assessments";
      } else {
        window.location.href = redirectUrl;
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      {/* Left Column - Visual Section (Hidden on Mobile) */}
      <div className="hidden lg:flex flex-1 relative bg-muted/20 border-r border-border items-center justify-center overflow-hidden flex-col p-12 lg:p-20">
        {/* Abstract Technical Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] bg-[size:32px_32px] opacity-[0.03] dark:opacity-[0.05]" />

        {/* Glow effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-lg flex flex-col justify-between h-full">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold tracking-wide mb-8">
              <ShieldCheck className="w-4 h-4" /> Secure Authentication
            </div>
            <h1 className="text-5xl font-extrabold tracking-tight mb-6 text-foreground leading-tight">
              Build your technical <br />
              foundation.
            </h1>
            <p className="text-xl text-foreground/90 font-medium leading-relaxed max-w-md">
              Access your personalized learning environment, track your progress, and master your technical skills securely.
            </p>
          </div>

          <div className="space-y-6 mt-12">
            <div>
              <h2 className="text-2xl font-bold text-foreground">CodeSkill</h2>
              <p className="text-sm font-semibold text-primary mt-1">by Chandigarh University</p>
              <p className="text-xs text-muted-foreground mt-0.5">Department of Skill Development</p>
            </div>
            
            <p className="text-sm text-foreground/80 leading-relaxed max-w-md border-l-2 border-primary/30 pl-4 py-1">
              Standardized examination portal and algorithmic skill-building platform engineered for developers, students, and technical evaluations.
            </p>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/50 border border-border/50 text-foreground/80 text-xs font-medium backdrop-blur-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Proctored & Verified Examination Infrastructure
            </div>
          </div>

        </div>
      </div>

      {/* Right Column - Login Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative bg-background">
        <div className="w-full max-w-[400px] flex flex-col gap-8">

          {/* Header */}
          <div className="flex flex-col">
            <div className="w-24 h-24 bg-card border border-border rounded-2xl p-2.5 flex items-center justify-center mb-6 shadow-sm">
              <img
                src="https://images.seeklogo.com/logo-png/43/1/chandigarh-university-cu-logo-png_seeklogo-432515.png"
                alt="Logo"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/cu-logo.png";
                }}
              />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground mb-2">
              Welcome back
            </h2>
            <p className="text-sm text-muted-foreground">
              Please enter your credentials to access your account.
            </p>
          </div>

          {/* Form Component */}
          <LoginForm
            onSubmit={handleLogin}
            loading={loading}
          />

          {/* Footer Terms */}
          <p className="text-center text-xs text-muted-foreground">
            By signing in, you agree to our{" "}
            <a href="#" className="underline hover:text-foreground transition-colors">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="underline hover:text-foreground transition-colors">
              Privacy Policy
            </a>.
          </p>
        </div>
      </div>
    </div>
  );
}
