'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAuthStore } from '@/stores/authStore'

// ── Validation ────────────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    // Maps to the backend `username` — must match its rules exactly so the
    // user gets instant feedback instead of a server-side 422.
    displayName: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(50, 'Username is too long')
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        'Use only letters, numbers, _ and - (no spaces)'
      ),
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

type RegisterFormValues = z.infer<typeof registerSchema>

// ── Component ─────────────────────────────────────────────────────────────────

export function RegisterForm() {
  const router = useRouter()
  const { register: signUp, isLoading, error, clearError } = useAuthStore()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  })

  async function onSubmit(values: RegisterFormValues) {
    clearError()
    const ok = await signUp(values.email, values.password, values.displayName)
    if (ok) {
      router.replace('/dashboard')
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mb-2 flex justify-center">
          <span className="text-4xl" aria-hidden>🎬</span>
        </div>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Start editing smarter with AI</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-status-error/30 bg-status-error/10
                         px-4 py-3 text-sm text-status-error"
            >
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="displayName">Username</Label>
            <Input
              id="displayName"
              type="text"
              autoComplete="username"
              placeholder="aarav_sharma"
              error={errors.displayName?.message}
              {...register('displayName')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register('email')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              error={errors.password?.message}
              {...register('password')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
          </div>

          <Button type="submit" className="w-full" loading={isLoading}>
            Create Account
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center text-sm text-text-secondary">
        <p>
          Already have an account?{' '}
          <Link href="/login" className="text-accent hover:text-accent-glow font-medium">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
