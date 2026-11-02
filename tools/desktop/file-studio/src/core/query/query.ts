import { DOMParser } from '@xmldom/xmldom'
import fontoxpath from 'fontoxpath'
import { JSONPath } from 'jsonpath-plus'
import { errorMessage } from '../errors'
import { assertSafeXml } from '../security/xml-guard'

export function queryJsonPath(value: unknown, path: string): unknown[] {
  if (/[();]|eval\b|function\b/i.test(path)) {
    throw new Error('JSONPath expressions that execute code are blocked.')
  }
  const query = JSONPath as unknown as (options: { path: string; json: unknown; preventEval: boolean; wrap: boolean }) => unknown
  const result = query({ path, json: value, preventEval: true, wrap: true })
  return Array.isArray(result) ? result : [result]
}

export function queryXPath(xml: string, expression: string): { ok: boolean; values: string[]; error?: string } {
  try {
    assertSafeXml(xml)
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    if (doc.getElementsByTagName('parsererror').length > 0) {
      return { ok: false, values: [], error: doc.getElementsByTagName('parsererror')[0].textContent ?? 'Invalid XML' }
    }
    const engine = fontoxpath as unknown as {
      evaluateXPathToString: (expression: string, node: unknown) => string
      evaluateXPathToStrings: (expression: string, node: unknown) => string[]
    }
    const values = expression.trim().startsWith('string(')
      ? [engine.evaluateXPathToString(expression, doc)]
      : engine.evaluateXPathToStrings(expression, doc)
    return { ok: true, values: values.map((value) => String(value)) }
  } catch (error) {
    return { ok: false, values: [], error: errorMessage(error) }
  }
}
