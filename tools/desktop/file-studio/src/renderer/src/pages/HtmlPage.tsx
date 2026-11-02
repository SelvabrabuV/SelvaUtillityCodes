import Editor from '@monaco-editor/react'
import { useMemo, useState } from 'react'
import { tablesToCsv } from '@core/csv/csv'
import { findReplace, parseHtmlTables, setCellText, sortTable, tableToMatrix } from '@core/html/parse-tables'
import { tablesToXlsx } from '@core/spreadsheet/excel'
import { DataGrid } from '@renderer/components/DataGrid'
import { Button, Modal } from '@renderer/components/ui'
import { exportBytes } from '@renderer/lib/session'
import { useSettings } from '@renderer/stores/settings'
import { activeTab, useWorkspace } from '@renderer/stores/workspace'
import { toast } from 'sonner'

export function HtmlPage() {
  const tab = useWorkspace(activeTab)
  const updateTab = useWorkspace((state) => state.updateTab)
  const settings = useSettings((state) => state.settings)
  const [query, setQuery] = useState('')
  const [replace, setReplace] = useState('')
  const [preview, setPreview] = useState<string[] | null>(null)
  const tables = tab?.tables ?? []
  const table = tables.find((item) => item.id === tab?.cursor) ?? tables[0]
  const matrix = useMemo(() => (table ? tableToMatrix(table) : []), [table])

  if (!tab || tab.module !== 'html') {
    return <EmptyHtml onPaste={(html) => openPasted(html)} />
  }

  const large = (tab.html?.length ?? 0) > 1_500_000
  return (
    <div className="grid h-full grid-cols-[240px_1fr] grid-rows-[auto_1fr]">
      <div className="col-span-2 flex flex-wrap gap-2 border-b border-[var(--color-line)] px-3 py-2">
        <Button
          tone="solid"
          onClick={() => {
            if (!tab.tables) return
            setPreview(tab.tables.map((item) => `${item.name}: ${item.rows.length} rows, ${item.merges.length} merges`))
          }}
        >
          Preview export
        </Button>
        <Button onClick={() => void exportExcel(tab.id, tab.tables ?? [], tab.title)}>Excel</Button>
        <Button onClick={() => void exportCsv(tab.tables ?? [], settings.csvDelimiter, settings.csvBom)}>CSV</Button>
        <input className="rounded border px-2 py-1 text-sm" placeholder="Find" value={query} onChange={(event) => setQuery(event.target.value)} />
        <input className="rounded border px-2 py-1 text-sm" placeholder="Replace" value={replace} onChange={(event) => setReplace(event.target.value)} />
        <Button
          onClick={() => {
            if (!table) return
            const result = findReplace(table, query, replace)
            updateTab(tab.id, { tables: tables.map((item) => (item.id === table.id ? result.table : item)), dirty: true })
            toast.success(`${result.count} replacements`)
          }}
        >
          Replace
        </Button>
        <Button onClick={() => table && updateTab(tab.id, { tables: tables.map((item) => (item.id === table.id ? sortTable(item, 0, 'asc') : item)), dirty: true })}>
          Sort first column
        </Button>
      </div>
      <aside className="studio-scroll overflow-auto border-r border-[var(--color-line)] p-2">
        {tables.map((item) => (
          <button
            key={item.id}
            className={`mb-2 block w-full rounded-lg px-3 py-2 text-left text-sm ${item.id === table?.id ? 'bg-[var(--color-teal)] text-white' : 'hover:bg-black/5'}`}
            onClick={() => updateTab(tab.id, { cursor: item.id })}
          >
            <div className="font-medium">{item.name}</div>
            <div className="text-xs opacity-80">
              {item.rows.length} × {item.rows[0]?.length ?? 0}
            </div>
          </button>
        ))}
      </aside>
      <div className="grid min-h-0 grid-rows-[180px_1fr]">
        {large ? (
          <p className="p-4 text-sm">This HTML file is too large for the source editor. The grid below is the editable view.</p>
        ) : (
          <Editor
            height="180px"
            language="html"
            theme={document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs'}
            value={tab.html}
            onChange={(value) => {
              const html = value ?? ''
              const next = parseHtmlTables(html, { includeHidden: settings.includeHiddenHtml })
              updateTab(tab.id, { html, tables: next, dirty: true, validation: `${next.length} tables` })
            }}
          />
        )}
        <DataGrid
          rows={matrix.slice(table?.headerRowCount ?? 0)}
          headers={table && table.headerRowCount > 0 ? table.rows[0].map((cell) => cell.text) : undefined}
          onEdit={(row, column, value) => {
            if (!table) return
            const targetRow = row + table.headerRowCount
            const next = setCellText(table, targetRow, column, value)
            updateTab(tab.id, { tables: tables.map((item) => (item.id === table.id ? next : item)), dirty: true })
          }}
        />
      </div>
      <Modal title="Export preview" open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <ul className="space-y-1 text-sm">
          {preview?.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-black/60">The source HTML file is not modified. Excel keeps merged cells. CSV flattens them.</p>
        <div className="mt-4 flex justify-end">
          <Button tone="solid" onClick={() => setPreview(null)}>
            Close
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function EmptyHtml({ onPaste }: { onPaste: (html: string) => void }) {
  return (
    <div className="grid h-full place-items-center">
      <form
        className="w-[min(640px,90vw)]"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          onPaste(String(data.get('html') ?? ''))
        }}
      >
        <h2 className="text-2xl font-semibold">Paste an HTML table</h2>
        <textarea name="html" className="mt-3 h-48 w-full rounded-lg border p-3" placeholder="<table><tr><td>Ada</td></tr></table>" />
        <Button tone="solid" className="mt-3" type="submit">
          Parse tables
        </Button>
      </form>
    </div>
  )
}

function openPasted(html: string): void {
  const tables = parseHtmlTables(html)
  useWorkspace.getState().openTab({
    id: `html-${Date.now()}`,
    module: 'html',
    title: 'Pasted HTML',
    dirty: true,
    html,
    tables,
    size: html.length,
    validation: `${tables.length} tables`,
    cursor: tables[0]?.id ?? ''
  })
}

async function exportExcel(id: string, tables: ReturnType<typeof parseHtmlTables>, title: string): Promise<void> {
  const bytes = await tablesToXlsx({ tables })
  await exportBytes(title.replace(/\.html?$/i, '') + '.xlsx', bytes)
  useWorkspace.getState().updateTab(id, { validation: 'Excel exported' })
}

async function exportCsv(tables: ReturnType<typeof parseHtmlTables>, delimiter: ',' | ';' | '\t', bom: boolean): Promise<void> {
  const files = tablesToCsv(tables, { delimiter, bom })
  if (files.length === 1) {
    await exportBytes(files[0].fileName, new TextEncoder().encode(files[0].contents))
    if (files[0].warning) toast.message(files[0].warning)
    return
  }
  for (const file of files) {
    await exportBytes(file.fileName, new TextEncoder().encode(file.contents))
  }
}
