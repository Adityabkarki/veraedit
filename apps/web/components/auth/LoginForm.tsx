'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required'),
})

type LoginFormValues = z.infer<typeof loginSchema>

// ── Component ─────────────────────────────────────────────────────────────────

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next')
  const { login, isLoading, error, clearError } = useAuthStore()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(values: LoginFormValues) {
    clearError()
    const ok = await login(values.email, values.password)
    if (ok) {
      // Let tokens flush to storage before protected routes load
      await new Promise((r) => setTimeout(r, 50))
      router.replace(nextPath && nextPath.startsWith('/') ? nextPath : '/dashboard')
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        {/* Logo mark */}
        <div className="mb-2 flex justify-center">
          <span className="text-4xl" aria-hidden>🎬</span>
        </div>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to your ViraEdit account</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {/* API-level error — plain English, no HTTP codes */}
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
              autoComplete="current-password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />
          </div>

          <Button type="submit" className="w-full" loading={isLoading}>
            Sign In
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex-col gap-2 text-center text-sm text-text-secondary">
        <Link
          href="/forgot-password"
          className="hover:text-text-primary transition-colors"
        >
          Forgot password?
        </Link>
        <p>
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-accent hover:text-accent-glow font-medium">
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
