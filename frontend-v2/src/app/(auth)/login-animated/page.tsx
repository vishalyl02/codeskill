'use client';

import React, { useState, ChangeEvent, FormEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Ripple,
  AuthTabs,
  TechOrbitDisplay,
  type IconConfig,
} from '@/components/ui/modern-animated-sign-in';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'react-hot-toast';
import {
  Code2,
  Cpu,
  ShieldCheck,
  Terminal,
  Database,
  Layers,
  Sparkles,
  Award,
} from 'lucide-react';

const iconsArray: IconConfig[] = [
  {
    component: () => (
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-card border border-primary/40 shadow-xs text-primary">
        <Code2 className="w-4 h-4" />
      </div>
    ),
    className: 'size-[36px] border-none bg-transparent',
    duration: 22,
    delay: 15,
    radius: 90,
    path: true,
    reverse: false,
  },
  {
    component: () => (
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-card border border-border shadow-xs text-amber-500">
        <Cpu className="w-4 h-4" />
      </div>
    ),
    className: 'size-[36px] border-none bg-transparent',
    duration: 22,
    delay: 5,
    radius: 90,
    path: false,
    reverse: false,
  },
  {
    component: () => (
      <div className="flex items-center justify-center w-11 h-11 rounded-full bg-card border border-border shadow-xs text-emerald-500">
        <ShieldCheck className="w-5 h-5" />
      </div>
    ),
    className: 'size-[44px] border-none bg-transparent',
    radius: 160,
    duration: 28,
    path: true,
    reverse: true,
  },
  {
    component: () => (
      <div className="flex items-center justify-center w-11 h-11 rounded-full bg-card border border-border shadow-xs text-cyan-500">
        <Terminal className="w-5 h-5" />
      </div>
    ),
    className: 'size-[44px] border-none bg-transparent',
    radius: 160,
    duration: 28,
    delay: 14,
    path: false,
    reverse: true,
  },
  {
    component: () => (
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-card border border-primary/30 shadow-xs text-primary">
        <Database className="w-6 h-6" />
      </div>
    ),
    className: 'size-[48px] border-none bg-transparent',
    radius: 230,
    duration: 35,
    path: true,
    reverse: false,
  },
  {
    component: () => (
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-card border border-border shadow-xs text-purple-500">
        <Layers className="w-6 h-6" />
      </div>
    ),
    className: 'size-[48px] border-none bg-transparent',
    radius: 230,
    duration: 35,
    delay: 18,
    path: false,
    reverse: false,
  },
  {
    component: () => (
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-card border border-amber-400/40 shadow-xs text-amber-400">
        <Award className="w-7 h-7" />
      </div>
    ),
    className: 'size-[56px] border-none bg-transparent',
    radius: 300,
    duration: 40,
    delay: 10,
    path: true,
    reverse: true,
  },
];

export default function AnimatedLoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    uid: '',
    password: '',
    rememberMe: false,
  });
  const [errorField, setErrorField] = useState('');

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement>,
    name: string
  ) => {
    const value = event.target.value;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setErrorField('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorField('');

    try {
      const input = formData.uid.trim();
      const res = await login({
        email: input,
        password: formData.password,
        rememberMe: formData.rememberMe,
      });

      if (res?.user?.isAdmin) {
        window.location.href = '/admin/dashboard';
      } else if (res?.user?.isAssessmentStudent) {
        window.location.href = '/assessments';
      } else {
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      setErrorField(
        err.message || 'Invalid credentials. Please verify your UID/Email and password.'
      );
    }
  };

  const goToForgotPassword = (
    event: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>
  ) => {
    event.preventDefault();
    toast.error('Contact your department examination coordinator to reset password.');
  };

  const formFields = {
    header: 'Welcome Back',
    subHeader: 'Chandigarh University Examination & Assessment Portal',
    fields: [
      {
        label: 'University UID or Email',
        name: 'uid',
        required: true,
        type: 'text' as const,
        placeholder: 'e.g. 22BCS1001 or admin@cuchd.in',
        value: formData.uid,
        onChange: (event: ChangeEvent<HTMLInputElement>) =>
          handleInputChange(event, 'uid'),
      },
      {
        label: 'Password',
        name: 'password',
        required: true,
        type: 'password' as const,
        placeholder: '••••••••••••',
        value: formData.password,
        onChange: (event: ChangeEvent<HTMLInputElement>) =>
          handleInputChange(event, 'password'),
      },
    ],
    submitButton: 'Sign In to Portal',
    textVariantButton: 'Forgot password / Need Help?',
    errorField,
  };

  return (
    <section className="relative flex min-h-screen bg-background text-foreground overflow-hidden">
      {/* Left Column - Tech Orbit Visualizer */}
      <div className="relative flex flex-col justify-center items-center w-1/2 max-lg:hidden border-r border-border bg-muted/20 overflow-hidden">
        <Ripple mainCircleSize={120} />
        <TechOrbitDisplay iconsArray={iconsArray} text="CodeSkill" />
      </div>

      {/* Right Column - Animated Form */}
      <div className="w-full lg:w-1/2 min-h-screen flex flex-col justify-center items-center p-6 sm:p-12 relative bg-background">
        <AuthTabs
          formFields={formFields}
          goTo={goToForgotPassword}
          handleSubmit={handleSubmit}
        />
      </div>
    </section>
  );
}
