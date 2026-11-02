import * as Dialog from '@radix-ui/react-dialog'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { clsx } from 'clsx'
import { type ButtonHTMLAttributes, type ReactNode } from 'react'

const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-40',
  {
    variants: {
      tone: {
        solid: 'bg-[var(--color-teal)] text-white hover:bg-[var(--color-teal-2)]',
        quiet: 'bg-transparent text-inherit hover:bg-black/5 dark:hover:bg-white/10',
        line: 'border border-[var(--color-line)] bg-white/70 hover:bg-white dark:border-white/15 dark:bg-white/5'
      }
    },
    defaultVariants: { tone: 'line' }
  }
)

export function Button({
  tone,
  asChild,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={clsx(buttonStyles({ tone }), className)} {...props} />
}

export function Modal({
  title,
  open,
  onOpenChange,
  children
}: {
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-[var(--color-panel)] p-5 text-[var(--color-ink)] shadow-2xl">
          <Dialog.Title className="mb-3 text-lg font-semibold">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
