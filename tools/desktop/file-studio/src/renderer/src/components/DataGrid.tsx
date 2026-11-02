import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useMemo, useRef, useState } from 'react'

export function DataGrid({
  rows,
  headers,
  onEdit,
  onSelect
}: {
  rows: string[][]
  headers?: string[]
  onEdit?: (row: number, column: number, value: string) => void
  onSelect?: (row: number, column: number) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [edit, setEdit] = useState<{ row: number; column: number } | null>(null)
  const [selected, setSelected] = useState<{ row: number; column: number } | null>(null)
  const [widths, setWidths] = useState<number[]>([])
  const widthFor = (index: number) => widths[index] ?? 160
  const columns = useMemo<ColumnDef<string[]>[]>(
    () =>
      (headers ?? rows[0]?.map((_, index) => `Column ${index + 1}`) ?? []).map((header, column) => ({
        id: String(column),
        header,
        cell: (info) => info.row.original[column] ?? ''
      })),
    [headers, rows]
  )
  // TanStack Table returns functions that the React compiler cannot memoize.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })
  const virtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 12
  })
  const headerGroup = table.getHeaderGroups()[0]

  return (
    <div ref={parentRef} className="studio-scroll h-full overflow-auto border border-[var(--color-line)] bg-white dark:bg-[#15181c]">
      <div
        className="sticky top-0 z-10 flex bg-[#1f4e5a] text-left text-xs text-white"
        style={{ width: headerGroup?.headers.reduce((sum, _, index) => sum + widthFor(index), 0) || '100%' }}
      >
        {headerGroup?.headers.map((header, index) => (
          <div key={header.id} className="relative shrink-0 border-r border-white/10 px-2 py-2 font-semibold" style={{ width: widthFor(index) }}>
            {flexRender(header.column.columnDef.header, header.getContext())}
            <span
              className="absolute right-0 top-0 h-full w-1 cursor-col-resize"
              onMouseDown={(event) => {
                event.preventDefault()
                const startX = event.clientX
                const startWidth = widthFor(index)
                const move = (moveEvent: MouseEvent) => {
                  const nextWidth = Math.max(72, startWidth + moveEvent.clientX - startX)
                  setWidths((current) => {
                    const next = [...current]
                    next[index] = nextWidth
                    return next
                  })
                }
                const up = () => {
                  window.removeEventListener('mousemove', move)
                  window.removeEventListener('mouseup', up)
                }
                window.addEventListener('mousemove', move)
                window.addEventListener('mouseup', up)
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = table.getRowModel().rows[item.index]
          return (
            <div key={row.id} className="absolute left-0 flex border-b border-black/5 text-sm" style={{ top: item.start, height: item.size }}>
              {row.getVisibleCells().map((cell, column) => {
                const editing = edit?.row === item.index && edit.column === column
                const active = selected?.row === item.index && selected.column === column
                const value = String(cell.getValue() ?? '')
                return (
                  <div
                    key={cell.id}
                    className={`shrink-0 border-r border-black/5 px-2 py-1 ${active ? 'bg-[#efe2b8]' : ''}`}
                    style={{ width: widthFor(column) }}
                    onClick={() => {
                      setSelected({ row: item.index, column })
                      onSelect?.(item.index, column)
                    }}
                    onDoubleClick={() => onEdit && setEdit({ row: item.index, column })}
                  >
                    {editing ? (
                      <input
                        autoFocus
                        className="w-full bg-transparent outline-none"
                        defaultValue={value}
                        onBlur={(event) => {
                          onEdit?.(item.index, column, event.target.value)
                          setEdit(null)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
                        }}
                      />
                    ) : (
                      <span className="block truncate">{value}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
