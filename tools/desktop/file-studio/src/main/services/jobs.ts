import { Worker } from 'node:worker_threads'
import { join } from 'node:path'

interface WorkerReply {
  id: string
  ok: boolean
  result?: unknown
  error?: string
}

const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
let worker: Worker | null = null
let sequence = 0

function thread(): Worker {
  if (worker) return worker
  worker = new Worker(join(__dirname, 'conversion-worker.js'))
  worker.on('message', (message: WorkerReply) => {
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.ok) waiter.resolve(message.result)
    else waiter.reject(new Error(message.error ?? 'Job failed'))
  })
  worker.on('error', (error) => {
    for (const waiter of pending.values()) waiter.reject(error)
    pending.clear()
    worker = null
  })
  return worker
}

export function runJob(type: string, payload: Record<string, unknown>): Promise<unknown> {
  const id = `job-${sequence += 1}`
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    thread().postMessage({ id, type, payload })
  })
}
