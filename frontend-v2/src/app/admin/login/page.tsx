"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { 
  ShieldCheck, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Mail, 
  Lock,
  ArrowLeft
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";
import { AuthUI } from "@/components/ui/auth-ui";
import { OtpInput, type OtpInputHandle, type OtpStatus } from "@/components/ui/otp-input";

const adminLoginSchema = z.object({
  email: z.string().min(1, { message: "Please enter your administrator email or ID." }),
  password: z.string().optional(),
  otp: z.string().optional(),
});

type AdminLoginFormValues = z.infer<typeof adminLoginSchema>;

export default function AdminLoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [showOTP, setShowOTP] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [otpStatus, setOtpStatus] = useState<OtpStatus>("idle");
  const [otpErrorMessage, setOtpErrorMessage] = useState<string>("");
  const otpRef = useRef<OtpInputHandle>(null);
  const { adminLogin, adminLoginVerify } = useAuth();
  const router = useRouter();

  const form = useForm<AdminLoginFormValues>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const onSubmit = async (data: AdminLoginFormValues) => {
    setIsLoading(true);
    form.clearErrors("root");
    setInfoMessage(null);
    setOtpStatus("idle");
    setOtpErrorMessage("");
    try {
      if (!showOTP) {
        const res = await adminLogin({ email: data.email, password: data.password });
        if (res.requireOTP) {
          setShowOTP(true);
          if (res.message) setInfoMessage(res.message);
        } else {
          window.location.href = "/admin/dashboard";
        }
      } else {
        const otpCode = data.otp?.trim() || "";
        if (!otpCode || otpCode.length < 6) {
          setOtpStatus("error");
          setOtpErrorMessage("Please enter all 6 digits of the OTP code.");
          form.setError("otp", { type: "manual", message: "OTP must be 6 digits" });
          return;
        }
        await adminLoginVerify({ email: data.email, otp: otpCode });
        setOtpStatus("success");
        setTimeout(() => {
          window.location.href = "/admin/dashboard";
        }, 500);
      }
    } catch (err: any) {
      const msg = err.message || "Failed to authenticate admin";
      if (showOTP) {
        setOtpStatus("error");
        setOtpErrorMessage(msg);
      } else {
        form.setError("root", { type: "manual", message: msg });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <AuthUI
        signInContent={{
          image: {
            src: "https://images.unsplash.com/photo-1497215728101-856f4ea42174?q=80&w=2070&auto=format&fit=crop",
            alt: "A professional office environment"
          },
          quote: {
            text: "Secure assessment administration for Chandigarh University.",
            author: "CodeSkill Admin"
          }
        }}
      >
        <div className="w-full max-w-[420px] flex flex-col gap-6 mx-auto px-4 sm:px-0">
          {/* Admin Login Box */}
          <div className="rounded-3xl border border-border/70 bg-card/60 backdrop-blur-sm p-6 sm:p-8 shadow-sm transition-all space-y-6">
            {/* Dual Co-Branding Header: CodeSkill Admin Logo | CU Logo */}
            <div className="flex items-center justify-center gap-3 sm:gap-4 select-none pt-1">
              {/* 1. Chandigarh University Logo (Enlarged) - FIRST */}
              <div
                className="h-[54px] sm:h-[62px] px-3.5 py-1.5 rounded-2xl overflow-hidden bg-white border border-border/80 shadow-xs flex items-center justify-center shrink-0 transition-transform duration-200 hover:scale-105"
                title="Chandigarh University"
              >
                <img
                  src="/cu-logo-tight.png"
                  alt="Chandigarh University"
                  className="h-full w-auto object-contain"
                />
              </div>

              {/* Divider */}
              <div className="h-9 sm:h-11 w-[1px] bg-border/80 shrink-0" aria-hidden="true" />

              {/* 2. CodeSkill Logo + Wordmark - SECOND */}
              <Link
                href="/"
                className="inline-flex items-center gap-2.5 group transition-transform duration-200 hover:scale-[1.02]"
                title="CodeSkill Home"
              >
                <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-2xl overflow-hidden border border-black/10 dark:border-white/15 bg-background shadow-xs flex items-center justify-center p-0.5 group-hover:scale-105 transition-transform duration-200">
                  <img
                    src="/icon.svg"
                    alt="CodeSkill Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="font-bold text-2xl sm:text-[26px] tracking-tight leading-none text-foreground font-sans">
                  CodeSkill
                </span>
              </Link>
            </div>

            <div className="space-y-1.5 text-center flex flex-col items-center">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground text-center">
                {showOTP ? "Verify Your Identity" : "Admin Sign In"}
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed text-center max-w-xs sm:max-w-sm">
                {showOTP
                  ? `Enter the 6-digit security code sent to ${form.getValues("email") || "your administrator email"}.`
                  : "Sign in to access the examination and assessment administration console."}
              </p>
            </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 text-left">
            {form.formState.errors.root && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-red-800 leading-snug">
                  {form.formState.errors.root.message}
                </p>
              </div>
            )}

            {infoMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-emerald-800 leading-snug">
                  {infoMessage}
                </p>
              </div>
            )}

            {!showOTP ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Email / Institutional ID</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      placeholder="admin@institution.edu or ADM001"
                      disabled={isLoading}
                      {...form.register("email")}
                      className={`w-full h-[46px] bg-background border ${form.formState.errors.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'border-input focus:border-primary focus:ring-primary/20'} rounded-xl pl-10 pr-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-4 transition-all text-sm font-medium disabled:opacity-50`}
                    />
                  </div>
                  {form.formState.errors.email && (
                    <p className="text-xs font-medium text-red-500 ml-1">{form.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2 relative">
                  <label className="text-sm font-semibold text-foreground">Password</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      disabled={isLoading}
                      {...form.register("password")}
                      className={`w-full h-[46px] bg-background border ${form.formState.errors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'border-input focus:border-primary focus:ring-primary/20'} rounded-xl pl-10 pr-11 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-4 transition-all text-sm font-medium tracking-wide disabled:opacity-50`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.formState.errors.password && (
                    <p className="text-xs font-medium text-red-500 ml-1">{form.formState.errors.password.message}</p>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-muted/40 border border-border rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-foreground font-medium truncate max-w-[260px]">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{form.getValues("email")}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowOTP(false);
                      setOtpStatus("idle");
                      setOtpErrorMessage("");
                      form.setValue("otp", "");
                    }}
                    className="text-primary hover:underline font-semibold shrink-0"
                  >
                    Change
                  </button>
                </div>

                <div className="flex flex-col items-center justify-center py-2">
                  <OtpInput
                    ref={otpRef}
                    length={6}
                    groupEvery={3}
                    autoFocus={true}
                    disabled={isLoading}
                    status={otpStatus}
                    errorMessage={otpErrorMessage}
                    successMessage="Code verified! Signing in..."
                    hint="Enter the 6-digit one-time code"
                    className="items-center"
                    onChange={(val) => {
                      form.setValue("otp", val);
                      if (otpStatus !== "idle") {
                        setOtpStatus("idle");
                        setOtpErrorMessage("");
                      }
                    }}
                    onComplete={(val) => {
                      form.setValue("otp", val);
                      form.handleSubmit(onSubmit)();
                    }}
                  />
                </div>

                <div className="flex items-center justify-center pt-1">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={async () => {
                      try {
                        setIsLoading(true);
                        setOtpStatus("idle");
                        setOtpErrorMessage("");
                        const res = await adminLogin({
                          email: form.getValues("email"),
                          password: form.getValues("password"),
                        });
                        setInfoMessage(res.message || "A fresh OTP code has been dispatched to your email.");
                        otpRef.current?.clear();
                      } catch (err: any) {
                        setOtpStatus("error");
                        setOtpErrorMessage(err.message || "Failed to resend OTP");
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    Didn&apos;t receive code? <span className="text-primary underline">Resend OTP</span>
                  </button>
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-[46px] rounded-xl bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground font-bold text-sm transition-all flex items-center justify-center disabled:opacity-70 shadow-sm disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <Spinner className="w-4 h-4 animate-spin text-primary-foreground" />
                    <span>Authenticating...</span>
                  </div>
                ) : (showOTP ? "Verify Login" : "Authenticate as Admin")}
              </button>
            </div>
          </form>
        </div>

        {/* Footer & Standard Link */}
        <div className="flex flex-col gap-3 text-center">
          <p className="text-xs text-muted-foreground">
            Authorized faculty and examination controllers only.
          </p>

          <div className="pt-2 border-t border-border/40 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <Link
              href="/"
              className="group inline-flex items-center gap-1.5 font-medium hover:text-foreground transition-colors"
            >
              <span className="transition-transform group-hover:-translate-x-0.5">&larr;</span>
              <span>Return to Home</span>
            </Link>

            <span className="text-border/80">•</span>

            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 font-medium text-muted-foreground/80 hover:text-foreground transition-colors"
            >
              <span>Standard Sign In</span>
            </Link>
          </div>
        </div>
      </div>
      </AuthUI>
    </>
  );
}
