import { useSettings } from '@renderer/stores/settings'

export function SettingsPage() {
  const settings = useSettings((state) => state.settings)
  const update = useSettings((state) => state.update)
  return (
    <form className="mx-auto grid max-w-xl gap-4 px-6 py-8 text-sm">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <label>
        Theme
        <select className="mt-1 block w-full rounded border px-2 py-1" value={settings.theme} onChange={(event) => void update({ theme: event.target.value as typeof settings.theme })}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label>
        Density
        <select className="mt-1 block w-full rounded border px-2 py-1" value={settings.uiDensity} onChange={(event) => void update({ uiDensity: event.target.value as typeof settings.uiDensity })}>
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
      </label>
      <label>
        CSV delimiter
        <select className="mt-1 block w-full rounded border px-2 py-1" value={settings.csvDelimiter} onChange={(event) => void update({ csvDelimiter: event.target.value as typeof settings.csvDelimiter })}>
          <option value=",">Comma</option>
          <option value=";">Semicolon</option>
          <option value="	">Tab</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.csvBom} onChange={(event) => void update({ csvBom: event.target.checked })} />
        Write a UTF-8 BOM on CSV files
      </label>
      <label>
        JSON indent
        <input className="mt-1 block w-full rounded border px-2 py-1" type="number" min={0} max={8} value={settings.jsonIndent} onChange={(event) => void update({ jsonIndent: Number(event.target.value) })} />
      </label>
      <label>
        Large-file warning (bytes)
        <input className="mt-1 block w-full rounded border px-2 py-1" type="number" value={settings.largeFileBytes} onChange={(event) => void update({ largeFileBytes: Number(event.target.value) })} />
      </label>
      <label>
        Image quality
        <input className="mt-1 block w-full" type="range" min={0.4} max={1} step={0.01} value={settings.imageQuality} onChange={(event) => void update({ imageQuality: Number(event.target.value) })} />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.includeHiddenHtml} onChange={(event) => void update({ includeHiddenHtml: event.target.checked })} />
        Include hidden HTML cells
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.autosave} onChange={(event) => void update({ autosave: event.target.checked })} />
        Keep recovery copies of unsaved HTML, JSON, XML, and image projects. PDFs are not copied. Originals stay unchanged.
      </label>
    </form>
  )
}
