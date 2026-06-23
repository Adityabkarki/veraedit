# ViraEdit — Error Handling Patterns

## Philosophy

1. Fail loudly in development, gracefully in production
2. Every error has a request_id and user-friendly message
3. Errors in background workers NEVER crash the worker — log and continue
4. AI failures fall back gracefully (cheaper model, cached result, skip step)
5. Users always know what's happening — no silent failures

---

## Standard Error Response (API)

All API errors return this shape:
```json
{
  "error": "ASSET_NOT_FOUND",
  "message": "The requested asset does not exist or you don't have access",
  "request_id": "req_abc123",
  "details": {
    "asset_id": "abc-123"
  }
}
```

HTTP status codes:
- 400: Bad request (invalid input)
- 401: Unauthenticated (missing/invalid token)
- 403: Unauthorized (don't have permission)
- 404: Not found
- 409: Conflict (duplicate, already exists)
- 422: Validation error (wrong data type/format)
- 429: Rate limited
- 500: Internal server error
- 503: Service unavailable (worker down)

---

## Python Error Handling

### FastAPI Exception Handlers

```python
# apps/api/main.py

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    log.error(
        "unhandled_exception",
        error=str(exc),
        request_id=request.state.request_id,
        path=request.url.path,
        exc_info=True  # includes stack trace in log
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "INTERNAL_ERROR",
            "message": "An unexpected error occurred. We've been notified.",
            "request_id": request.state.request_id
        }
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail.get("error", "HTTP_ERROR"),
            "message": exc.detail.get("message", str(exc.detail)),
            "request_id": getattr(request.state, "request_id", None),
        }
    )

# Custom exception classes
class ViraEditError(Exception):
    def __init__(self, error_code: str, message: str, status_code: int = 400, details: dict = None):
        self.error_code = error_code
        self.message = message
        self.status_code = status_code
        self.details = details or {}

class AssetNotFoundError(ViraEditError):
    def __init__(self, asset_id: str):
        super().__init__(
            error_code="ASSET_NOT_FOUND",
            message=f"Asset {asset_id} not found",
            status_code=404,
            details={"asset_id": asset_id}
        )

class BudgetExceededError(ViraEditError):
    def __init__(self, project_id: str, limit: float, current: float):
        super().__init__(
            error_code="BUDGET_EXCEEDED",
            message=f"AI budget limit of ${limit:.2f}/hr exceeded",
            status_code=402,
            details={"project_id": project_id, "limit_usd": limit, "current_usd": current}
        )
```

### Celery Worker Error Handling

```python
# workers/analysis/tasks.py

@celery_app.task(
    queue='analysis',
    max_retries=3,
    default_retry_delay=60,  # 1 minute
    autoretry_for=(Exception,),
    retry_backoff=True,  # exponential backoff
    retry_backoff_max=600,  # max 10 minutes between retries
)
def analyze_scenes(asset_id: str):
    log = structlog.get_logger().bind(
        task="analyze_scenes",
        asset_id=asset_id,
        task_id=analyze_scenes.request.id
    )
    
    try:
        log.info("task_started")
        
        # ... do work ...
        
        log.info("task_completed", scene_count=len(scenes))
        return {"status": "success", "scene_count": len(scenes)}
        
    except BudgetExceededError as e:
        # Don't retry budget errors — switch to local model
        log.warning("budget_exceeded_switching_to_local", 
                   error=str(e), project_id=e.details.get("project_id"))
        # Re-run with local model flag
        analyze_scenes_local.delay(asset_id)
        return {"status": "retried_with_local"}
        
    except RateLimitError as e:
        # Retry with longer delay
        log.warning("rate_limited", retry_in=e.retry_after)
        raise analyze_scenes.retry(countdown=e.retry_after)
        
    except Exception as e:
        log.error("task_failed", 
                 error=str(e), 
                 error_type=type(e).__name__,
                 exc_info=True)
        # Update asset status to failed
        update_asset_status(asset_id, "analysis_failed", str(e))
        # Emit WebSocket error event
        emit_event(asset_id, "PIPELINE_STAGE_FAILED", {
            "stage": "scene_analysis",
            "error": "Scene analysis failed. You can retry from the editor."
        })
        raise  # Let Celery handle retry
```

### AI Call Error Handling

```python
# packages/ai/routing/model_router.py

async def call_with_fallback(
    self,
    task_type: str,
    prompt: str,
    primary_model: str,
    fallback_model: str,
    **kwargs
) -> ModelResponse:
    
    # Try primary
    try:
        response = await self._call_model(primary_model, prompt, **kwargs)
        await self._log_cost(task_type, primary_model, response)
        return response
        
    except RateLimitError as e:
        log.warning("primary_rate_limited_trying_fallback",
                   primary=primary_model, fallback=fallback_model)
        
    except AuthError as e:
        log.error("primary_auth_failed", model=primary_model, 
                 hint="Check API key in .env")
        # Don't fall back to cheaper model if auth is wrong
        raise
        
    except Exception as e:
        log.warning("primary_failed_trying_fallback",
                   primary=primary_model, fallback=fallback_model,
                   error=str(e))
    
    # Try fallback
    try:
        response = await self._call_model(fallback_model, prompt, **kwargs)
        await self._log_cost(task_type, fallback_model, response)
        return response
        
    except Exception as e:
        log.error("both_models_failed",
                 primary=primary_model, fallback=fallback_model,
                 error=str(e))
        raise AIUnavailableError(
            f"AI analysis unavailable. Both {primary_model} and {fallback_model} failed."
        )
```

---

## TypeScript Error Handling

### API Client

```typescript
// apps/web/lib/api.ts

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 30000,
})

// Request interceptor: add auth token
apiClient.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response interceptor: handle errors consistently
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ErrorResponse>) => {
    const requestId = error.response?.data?.request_id
    
    if (error.response?.status === 401) {
      // Try token refresh
      try {
        await tokenStore.refresh()
        return apiClient.request(error.config!)
      } catch {
        // Refresh failed — redirect to login
        tokenStore.clear()
        window.location.href = '/login'
      }
    }
    
    if (error.response?.status === 429) {
      // Rate limited — show toast with retry time
      const retryAfter = error.response.headers['retry-after']
      toast.error(`Too many requests. Try again in ${retryAfter}s.`)
    }
    
    if (error.response?.status === 500) {
      logger.error('server_error', {
        requestId,
        url: error.config?.url,
        method: error.config?.method,
      })
      toast.error('Something went wrong. Our team has been notified.')
    }
    
    return Promise.reject(error)
  }
)
```

### React Error Boundary

```typescript
// apps/web/components/shared/ErrorBoundary.tsx

class ErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false, error: null }
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error('react_error_boundary', {
      error: error.message,
      componentStack: info.componentStack,
    })
    
    // Send to Sentry if configured
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error, { extra: info })
    }
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
          <p className="text-zinc-400 mb-4">
            The editor encountered an error. Your work is saved.
          </p>
          <button onClick={() => window.location.reload()}>
            Reload Editor
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

### Async Operation Error Handling

```typescript
// Pattern for all async operations in stores
const loadProject = async (projectId: string) => {
  set({ loading: true, error: null })
  
  try {
    const project = await api.projects.get(projectId)
    set({ project, loading: false })
    
  } catch (error) {
    const message = error instanceof AxiosError
      ? error.response?.data?.message ?? 'Failed to load project'
      : 'An unexpected error occurred'
    
    logger.error('load_project_failed', { projectId, error: message })
    set({ error: message, loading: false })
    toast.error(message)
  }
}
```

---

## Structured Logging Setup

### Python (structlog)

```python
# apps/api/logging_config.py
import structlog
import logging

def configure_logging(env: str = "production"):
    if env == "development":
        # Pretty, colorful output in dev
        processors = [
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer()  # colored output
        ]
    else:
        # JSON in production (for log aggregation)
        processors = [
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer()
        ]
    
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
    )

# Usage throughout codebase:
import structlog
log = structlog.get_logger()

# Bind context once, use everywhere
log = log.bind(project_id=project_id, user_id=user_id)
log.info("pipeline_started", video_duration_s=duration)
log.warning("budget_warning", used_usd=1.60, limit_usd=2.00)
log.error("render_failed", error=str(e), task_id=task_id)
```

### TypeScript (pino)

```typescript
// apps/web/lib/logger.ts
import pino from 'pino'

export const logger = pino({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  transport: process.env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty' } 
    : undefined,
  base: {
    service: 'viraedit-web',
    version: process.env.NEXT_PUBLIC_APP_VERSION,
  },
})

// Usage:
logger.info({ projectId, clipCount }, 'timeline saved')
logger.warn({ suggestionId, confidence }, 'low confidence suggestion')
logger.error({ error, requestId }, 'API request failed')
```

---

## Worker Health Monitoring

```python
# workers/health.py

class WorkerHealthChecker:
    """
    Periodic health checks for all workers.
    Logs to Redis so API can expose /health endpoint.
    """
    
    def report_health(self, worker_name: str, status: str, details: dict):
        key = f"worker:health:{worker_name}"
        health = {
            "status": status,  # healthy, degraded, unhealthy
            "last_seen": datetime.utcnow().isoformat(),
            "task_count_1h": details.get("task_count", 0),
            "error_count_1h": details.get("error_count", 0),
            "avg_task_duration_s": details.get("avg_duration", 0),
            **details
        }
        redis.set(key, json.dumps(health), ex=120)  # expires in 2min
    
    def check_queue_depth(self, queue_name: str) -> int:
        """Alert if queue depth > threshold"""
        depth = celery_inspect.active_queues()
        if depth > 100:
            log.warning("queue_depth_high", queue=queue_name, depth=depth)
        return depth
```
