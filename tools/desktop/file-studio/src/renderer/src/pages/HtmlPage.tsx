import Editor from '@monaco-editor/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { tablesToCsv } from '@core/csv/csv'
import { deleteColumn, deleteRow, findReplace, matchingBodyRows, parseHtmlTables, renameHeader, setCellText, sortTable } from '@core/html/parse-tables'
import { tablesToXlsx } from '@core/spreadsheet/excel'
import { DataGrid } from '@renderer/components/DataGrid'
import { Button, Modal } from '@renderer/components/ui'
import { registerCommand } from '@renderer/lib/commands'
import { exportBytes } from '@renderer/lib/session'
import { useSettings } from '@renderer/stores/settings'
import { activeTab, useWorkspace } from '@renderer/stores/workspace'
import { toast } from 'sonner'

export function HtmlPage() {
  const tab = useWorkspace(activeTab)
  const updateTab = useWorkspace((state) => state.updateTab)
  const editTab = useWorkspace((state) => state.editTab)
  const settings = useSettings((state) => state.settings)
  const [query, setQuery] = useState('')
  const [replace, setReplace] = useState('')
  const [filter, setFilter] = useState('')
  const [filterColumn, setFilterColumn] = useState(-1)
  const [selected, setSelected] = useState<{ row: number; column: number } | null>(null)
  const [preview, setPreview] = useState<string[] | null>(null)
  const findRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)
  const tables = tab?.tables ?? []
  const table = tables.find((item) => item.id === tab?.cursor) ?? tables[0]
  const bodyIndexes = useMemo(() => (table ? matchingBodyRows(table, filterColumn, filter) : []), [table, filterColumn, filter])
  const rows = useMemo(
    () => bodyIndexes.map((index) => table?.rows[index]?.map((cell) => (cell.covered ? '' : cell.text)) ?? []),
    [bodyIndexes, table]
  )

  useEffect(() => {
    const stopFind = registerCommand('find', () => {
      if (!findRef.current) return false
      findRef.current.focus()
      return true
    })
    const stopReplace = registerCommand('replace', () => {
      if (!replaceRef.current) return false
      replaceRef.current.focus()
      return true
    })
    const stopExport = registerCommand('export', () => {
      if (!tab?.tables?.length) return false
      void exportExcel(tab.id, tab.tables, tab.title)
      return true
    })
    return () => {
      stopFind()
      stopReplace()
      stopExport()
    }
  }, [tab?.id, tab?.tables, tab?.title])

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
        <span className="self-center text-xs text-black/50">A filter hides rows here. Excel and CSV still export every row.</span>
        <WebpageForm compact />
        <input ref={findRef} className="rounded border px-2 py-1 text-sm" placeholder="Find" value={query} onChange={(event) => setQuery(event.target.value)} />
        <input ref={replaceRef} className="rounded border px-2 py-1 text-sm" placeholder="Replace" value={replace} onChange={(event) => setReplace(event.target.value)} />
        <Button
          onClick={() => {
            if (!table) return
            const result = findReplace(table, query, replace)
            editTab(tab.id, { tables: tables.map((item) => (item.id === table.id ? result.table : item)), dirty: true })
            toast.success(`${result.count} replacements`)
          }}
        >
          Replace
        </Button>
        <input className="rounded border px-2 py-1 text-sm" placeholder="Filter rows" value={filter} onChange={(event) => setFilter(event.target.value)} />
        <select className="rounded border px-2 py-1 text-sm" value={filterColumn} onChange={(event) => setFilterColumn(Number(event.target.value))}>
          <option value={-1}>Any column</option>
          {(table?.rows[0] ?? []).map((cell, index) => (
            <option key={index} value={index}>
              {cell.text || `Column ${index + 1}`}
            </option>
          ))}
        </select>
        <Button onClick={() => table && editTab(tab.id, { tables: tables.map((item) => (item.id === table.id ? sortTable(item, selected?.column ?? 0, 'asc') : item)), dirty: true })}>
          Sort column
        </Button>
        <Button
          onClick={() => {
            if (!table || selected == null) return
            const row = bodyIndexes[selected.row]
            if (row == null) return
            editTab(tab.id, { tables: tables.map((item) => (item.id === table.id ? deleteRow(item, row) : item)), dirty: true })
          }}
        >
          Delete row
        </Button>
        <Button
          onClick={() => {
            if (!table || selected == null) return
            editTab(tab.id, { tables: tables.map((item) => (item.id === table.id ? deleteColumn(item, selected.column) : item)), dirty: true })
          }}
        >
          Delete column
        </Button>
        <Button
          onClick={() => {
            if (!table || selected == null) return
            const name = window.prompt('Header name', table.rows[0]?.[selected.column]?.text ?? '')
            if (!name) return
            editTab(tab.id, { tables: tables.map((item) => (item.id === table.id ? renameHeader(item, selected.column, name) : item)), dirty: true })
          }}
        >
          Rename header
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
          rows={rows}
          headers={table && table.headerRowCount > 0 ? table.rows[0].map((cell) => cell.text) : undefined}
          onSelect={(row, column) => setSelected({ row, column })}
          onEdit={(row, column, value) => {
            if (!table) return
            const targetRow = bodyIndexes[row]
            if (targetRow == null) return
            const next = setCellText(table, targetRow, column, value)
            editTab(tab.id, { tables: tables.map((item) => (item.id === table.id ? next : item)), dirty: true })
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
    <div className="grid h-full place-items-center overflow-auto py-8">
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
      <WebpageForm />
    </div>
  )
}

function WebpageForm({ compact = false }: { compact?: boolean }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      className={compact ? 'flex flex-wrap items-center gap-2' : 'mt-8 w-[min(640px,90vw)]'}
      onSubmit={(event) => {
        event.preventDefault()
        setBusy(true)
        void openWebpage(url).finally(() => setBusy(false))
      }}
    >
      {!compact && (
        <>
          <h2 className="text-2xl font-semibold">Open a webpage</h2>
          <p className="mt-2 text-sm text-black/65">
            This downloads the address over the internet. Scripts on the page are not run. Local and private addresses are refused.
          </p>
        </>
      )}
      <input
        className="rounded border px-2 py-1 text-sm"
        placeholder="https://example.com/table"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
      />
      <Button disabled={busy || url.trim() === ''} type="submit">
        {busy ? 'Fetching' : 'Open webpage'}
      </Button>
      {compact && <span className="text-xs text-black/55">Uses the internet. Scripts are not run.</span>}
    </form>
  )
}

async function openWebpage(url: string): Promise<void> {
  try {
    const result = await window.studio.fetchHtml(url.trim())
    const tables = parseHtmlTables(result.html, { includeHidden: useSettings.getState().settings.includeHiddenHtml })
    useWorkspace.getState().openTab({
      id: `html-${Date.now()}`,
      module: 'html',
      title: result.name,
      dirty: true,
      html: result.html,
      tables,
      size: result.html.length,
      validation: `Fetched · ${tables.length} tables · scripts not run`,
      cursor: tables[0]?.id ?? ''
    })
    toast.message('Opened the page from the internet. Scripts were not run.')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'The page could not be fetched.')
  }
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
