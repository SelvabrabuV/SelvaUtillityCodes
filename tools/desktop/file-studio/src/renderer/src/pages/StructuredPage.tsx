import Editor from '@monaco-editor/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { addChild, formatJson, minifyJson, parseStructuredText, removeNode, renameKey, treeToValue, valueToTree, type TreeNode } from '@core/json/document'
import { applyMapping, arrayKeys, listRecordPaths, suggestMapping, upsertTemplate, writeMappedCell, type RecordMapping } from '@core/mapping/map-records'
import { matrixToCsv } from '@core/csv/csv'
import { queryJsonPath, queryXPath } from '@core/query/query'
import { rowsToXlsx } from '@core/spreadsheet/excel'
import { formatXml, jsonToXml, minifyXml, parseXml, xmlToJson } from '@core/xml/document'
import { DataGrid } from '@renderer/components/DataGrid'
import { Button } from '@renderer/components/ui'
import { registerCommand } from '@renderer/lib/commands'
import { exportBytes } from '@renderer/lib/session'
import { useSettings } from '@renderer/stores/settings'
import { activeTab, useWorkspace } from '@renderer/stores/workspace'
import { toast } from 'sonner'

export function StructuredPage() {
  const tab = useWorkspace(activeTab)
  const updateTab = useWorkspace((state) => state.updateTab)
  const editTab = useWorkspace((state) => state.editTab)
  const settings = useSettings((state) => state.settings)
  const updateSettings = useSettings((state) => state.update)
  const indent = settings.jsonIndent
  const [path, setPath] = useState('$.')
  const [hits, setHits] = useState<string[]>([])
  const [mapping, setMapping] = useState<RecordMapping | null>(null)
  const [templateName, setTemplateName] = useState('')
  const queryRef = useRef<HTMLInputElement>(null)
  const text = tab?.text ?? ''
  const format = tab?.format ?? 'json'
  const parsed = useMemo(() => (format === 'xml' ? null : parseStructuredText(text, format === 'jsonl' ? 'data.jsonl' : 'data.json')), [text, format])
  const xml = useMemo(() => (format === 'xml' ? parseXml(text) : null), [text, format])
  const tree = useMemo(() => (parsed?.ok ? valueToTree(parsed.value) : null), [parsed])
  const paths = useMemo(() => (parsed?.ok ? listRecordPaths(parsed.value) : []), [parsed])
  const table = useMemo(() => {
    if (!parsed?.ok || !mapping) return null
    try {
      return applyMapping(parsed.value, mapping)
    } catch {
      return null
    }
  }, [parsed, mapping])

  useEffect(() => {
    const stopFind = registerCommand('find', () => {
      if (!queryRef.current) return false
      queryRef.current.focus()
      return true
    })
    const stopExport = registerCommand('export', () => {
      if (!table) return false
      void rowsToXlsx(table.headers, table.rows).then((bytes) => exportBytes('mapped.xlsx', bytes))
      return true
    })
    return () => {
      stopFind()
      stopExport()
    }
  }, [table])

  if (!tab || tab.module !== 'structured') return <PasteStructured />

  const large = text.length > 1_500_000
  const diagnostics = format === 'xml' ? (xml?.diagnostics ?? []) : (parsed?.diagnostics ?? [])
  return (
    <div className="grid h-full grid-rows-[auto_1fr_180px]">
      <div className="flex flex-wrap gap-2 border-b border-[var(--color-line)] px-3 py-2">
        <Button onClick={() => rewrite(format === 'xml' ? formatXml(text, indent) : formatJson(text, indent))}>Beautify</Button>
        <Button onClick={() => rewrite(format === 'xml' ? minifyXml(text) : minifyJson(text))}>Minify</Button>
        <Button
          onClick={() => {
            if (format === 'xml') {
              const converted = xmlToJson(text, indent)
              toast.message(converted.warnings[0] ?? 'Converted')
              updateTab(tab.id, { text: converted.json, format: 'json', dirty: true })
            } else {
              const converted = jsonToXml(text, indent)
              toast.message(converted.warnings[0] ?? 'Converted')
              updateTab(tab.id, { text: converted.xml, format: 'xml', dirty: true })
            }
          }}
        >
          {format === 'xml' ? 'To JSON' : 'To XML'}
        </Button>
        <input ref={queryRef} className="w-64 rounded border px-2 py-1 text-sm" value={path} onChange={(event) => setPath(event.target.value)} />
        <Button
          onClick={() => {
            try {
              if (format === 'xml') {
                const result = queryXPath(text, path)
                if (!result.ok) throw new Error(result.error)
                setHits(result.values)
              } else if (parsed?.ok) {
                setHits(queryJsonPath(parsed.value, path).map((value) => JSON.stringify(value)))
              }
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Query failed')
            }
          }}
        >
          Query
        </Button>
        <select
          className="rounded border px-2 py-1 text-sm"
          value={mapping?.recordPath ?? ''}
          onChange={(event) => {
            if (!parsed?.ok) return
            const recordPath = event.target.value
            const keys = arrayKeys(parsed.value, recordPath)
            setMapping(suggestMapping(parsed.value, recordPath, keys[0] ?? null))
          }}
        >
          <option value="">Record path</option>
          {paths.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          className="rounded border px-2 py-1 text-sm"
          value={mapping?.expandPath ?? ''}
          onChange={(event) => {
            if (!parsed?.ok || !mapping) return
            setMapping(suggestMapping(parsed.value, mapping.recordPath, event.target.value || null))
          }}
        >
          <option value="">Keep nested arrays as JSON</option>
          {(parsed?.ok && mapping ? arrayKeys(parsed.value, mapping.recordPath) : []).map((key) => (
            <option key={key} value={key}>
              Expand {key}
            </option>
          ))}
        </select>
        <Button
          disabled={!table}
          onClick={() => {
            if (!table) return
            void rowsToXlsx(table.headers, table.rows).then((bytes) => exportBytes('mapped.xlsx', bytes))
          }}
        >
          Excel from mapping
        </Button>
        <Button
          disabled={!table}
          onClick={() => {
            if (!table) return
            const csv = matrixToCsv(table.headers, table.rows, { delimiter: settings.csvDelimiter, bom: settings.csvBom, newline: settings.csvNewline })
            void exportBytes('mapped.csv', new TextEncoder().encode(csv))
          }}
        >
          CSV from mapping
        </Button>
        <input className="w-36 rounded border px-2 py-1 text-sm" placeholder="Template name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
        <Button
          disabled={!mapping}
          onClick={() => {
            if (!mapping) return
            try {
              void updateSettings({ mappingTemplates: upsertTemplate(settings.mappingTemplates ?? [], templateName, mapping) })
              toast.success('Template saved on this computer')
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Could not save the template')
            }
          }}
        >
          Save template
        </Button>
        <select
          className="rounded border px-2 py-1 text-sm"
          value=""
          onChange={(event) => {
            const saved = (settings.mappingTemplates ?? []).find((item) => item.id === event.target.value)
            if (!saved) return
            setMapping({ recordPath: saved.recordPath, expandPath: saved.expandPath, columns: saved.columns.map((column) => ({ ...column })) })
            setTemplateName(saved.name)
          }}
        >
          <option value="">Saved templates</option>
          {(settings.mappingTemplates ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid min-h-0 grid-cols-2">
        {large ? (
          <p className="p-4 text-sm">This file is too large for Monaco. Use the tree and export tools, or raise the large-file limit in Settings.</p>
        ) : (
          <Editor
            language={format === 'xml' ? 'xml' : 'json'}
            theme={document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs'}
            value={text}
            onChange={(value) => updateTab(tab.id, { text: value ?? '', dirty: true, validation: diagnostics[0]?.message ?? 'Valid' })}
          />
        )}
        <div className="studio-scroll overflow-auto border-l border-[var(--color-line)] p-3 text-sm">
          <p className="mb-2 font-semibold">Tree</p>
          <p className="mb-2 text-xs text-black/60">
            Source edits win when they parse. Tree edits rewrite the source. An invalid source leaves this tree on the last good value.
          </p>
          {tree && (
            <TreeView
              node={tree}
              onChange={(next) => editTab(tab.id, { text: JSON.stringify(treeToValue(next), null, indent), dirty: true, format: 'json' })}
            />
          )}
          {xml && !xml.ok && <p className="text-red-700">{xml.diagnostics[0]?.message}</p>}
          {hits.length > 0 && (
            <ul className="mt-3 space-y-1">
              {hits.map((hit) => (
                <li key={hit}>{hit}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="min-h-0 border-t border-[var(--color-line)]">
        {table && mapping ? (
          <div className="grid h-full grid-rows-[auto_1fr]">
            <div className="flex gap-3 overflow-auto px-3 py-1 text-xs">
              {mapping.columns.map((column, index) => (
                <label key={`${column.sourcePath}-${index}`} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={column.include}
                    onChange={(event) =>
                      setMapping({
                        ...mapping,
                        columns: mapping.columns.map((item, itemIndex) => (itemIndex === index ? { ...item, include: event.target.checked } : item))
                      })
                    }
                  />
                  <span>{column.sourcePath}</span>
                  <input
                    className="w-24 rounded border px-1"
                    value={column.outputColumn}
                    onChange={(event) =>
                      setMapping({
                        ...mapping,
                        columns: mapping.columns.map((item, itemIndex) => (itemIndex === index ? { ...item, outputColumn: event.target.value } : item))
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <DataGrid
              headers={table.headers}
              rows={table.rows}
              onEdit={(row, column, value) => {
                if (!parsed?.ok) return
                try {
                  const next = writeMappedCell(parsed.value, mapping, row, column, value)
                  editTab(tab.id, { text: JSON.stringify(next, null, indent), dirty: true, format: 'json' })
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'That cell could not be written')
                }
              }}
            />
          </div>
        ) : (
          <p className="p-3 text-sm">Choose a record path to preview rows. One array can be expanded. A second array is written as JSON so it does not multiply rows.</p>
        )}
      </div>
    </div>
  )

  function rewrite(next: string): void {
    updateTab(tab!.id, { text: next, dirty: true })
  }
}

function TreeView({ node, onChange }: { node: TreeNode; onChange: (node: TreeNode) => void }) {
  return (
    <ul className="pl-3">
      <li>
        <span className="text-black/50">{node.type}</span> {node.key ?? '$'}
        {node.value != null && (
          <input
            className="ml-2 rounded border px-1"
            value={node.value}
            onChange={(event) => onChange({ ...node, value: event.target.value })}
          />
        )}
        {node.key != null && (
          <button
            className="ml-2 text-xs underline"
            onClick={() => {
              const name = window.prompt('Property name', node.key ?? '')
              if (!name) return
              try {
                onChange(renameKey(node, node.id, name))
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Could not rename')
              }
            }}
          >
            Rename
          </button>
        )}
        {(node.type === 'object' || node.type === 'array') && (
          <button
            className="ml-2 text-xs underline"
            onClick={() => {
              try {
                onChange(addChild(node, node.id, 'field', ''))
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Could not add a child')
              }
            }}
          >
            Add
          </button>
        )}
        {node.children.map((child) => (
          <span key={child.id}>
            <button
              className="ml-2 text-xs text-red-800"
              onClick={() => {
                try {
                  onChange(removeNode(node, child.id))
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Could not delete')
                }
              }}
            >
              Delete {child.key ?? child.type}
            </button>
            <TreeView
              node={child}
              onChange={(next) => onChange({ ...node, children: node.children.map((item) => (item.id === child.id ? next : item)) })}
            />
          </span>
        ))}
      </li>
    </ul>
  )
}

function PasteStructured() {
  return (
    <form
      className="mx-auto mt-16 w-[min(640px,90vw)]"
      onSubmit={(event) => {
        event.preventDefault()
        const text = String(new FormData(event.currentTarget).get('text') ?? '')
        const format = text.trim().startsWith('<') ? 'xml' : 'json'
        useWorkspace.getState().openTab({
          id: `structured-${Date.now()}`,
          module: 'structured',
          title: 'Pasted data',
          dirty: true,
          text,
          format,
          size: text.length,
          validation: 'Pasted',
          cursor: ''
        })
      }}
    >
      <h2 className="text-2xl font-semibold">Paste JSON or XML</h2>
      <textarea name="text" className="mt-3 h-48 w-full rounded-lg border p-3" />
      <Button tone="solid" className="mt-3" type="submit">
        Open
      </Button>
    </form>
  )
}
