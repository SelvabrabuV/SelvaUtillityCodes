import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    return new editorWorker()
  }
}

monaco.languages.register({ id: 'xml' })
monaco.languages.setMonarchTokensProvider('xml', {
  tokenizer: {
    root: [
      [/<!--/, 'comment', '@comment'],
      [/<!\[CDATA\[/, 'string', '@cdata'],
      [/<\/?[A-Za-z_:][\w:.-]*/, 'tag'],
      [/[^<]+/, ''],
      [/\/?>/, 'tag']
    ],
    comment: [
      [/-->/, 'comment', '@pop'],
      [/./, 'comment']
    ],
    cdata: [
      [/\]\]>/, 'string', '@pop'],
      [/./, 'string']
    ]
  }
})

loader.config({ monaco })

export { monaco }
