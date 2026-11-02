import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser'
import type { Diagnostic } from '@shared/types'
import { errorMessage } from '../errors'
import { assertSafeXml } from '../security/xml-guard'

export interface XmlParseResult {
  ok: boolean
  ordered?: unknown[]
  object?: unknown
  diagnostics: Diagnostic[]
  warnings: string[]
}

const shared = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  commentPropName: '#comment',
  cdataPropName: '#cdata',
  allowBooleanAttributes: true,
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
  htmlEntities: false,
  ignoreDeclaration: false,
  ignorePiTags: false
}

export function parseXml(xml: string): XmlParseResult {
  const warnings = conversionWarnings(xml)
  try {
    assertSafeXml(xml)
  } catch (error) {
    return { ok: false, diagnostics: [{ severity: 'error', message: errorMessage(error), line: 1, column: 1 }], warnings }
  }
  const validated = XMLValidator.validate(xml, { allowBooleanAttributes: true })
  if (validated !== true) {
    const err = validated.err
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          message: err.msg,
          line: err.line,
          column: err.col
        }
      ],
      warnings
    }
  }
  try {
    const orderedParser = new XMLParser({ ...shared, preserveOrder: true })
    const objectParser = new XMLParser({ ...shared, preserveOrder: false })
    const ordered = orderedParser.parse(xml) as unknown[]
    const object = objectParser.parse(xml) as unknown
    return { ok: true, ordered, object, diagnostics: [], warnings }
  } catch (error) {
    return { ok: false, diagnostics: [{ severity: 'error', message: errorMessage(error), line: 1, column: 1 }], warnings }
  }
}

export function formatXml(xml: string, indent = 2): string {
  const parsed = parseXml(xml)
  if (!parsed.ok || !parsed.ordered) throw new Error(parsed.diagnostics[0]?.message ?? 'Invalid XML')
  const builder = new XMLBuilder({
    ...shared,
    preserveOrder: true,
    format: indent > 0,
    indentBy: ' '.repeat(indent),
    suppressEmptyNode: false
  })
  return builder.build(parsed.ordered) as string
}

export function minifyXml(xml: string): string {
  const parsed = parseXml(xml)
  if (!parsed.ok || !parsed.ordered) throw new Error(parsed.diagnostics[0]?.message ?? 'Invalid XML')
  const builder = new XMLBuilder({ ...shared, preserveOrder: true, format: false, suppressEmptyNode: false })
  return builder.build(parsed.ordered) as string
}

export interface XmlJsonOptions {
  attributePrefix?: string
  textNodeName?: string
}

export function xmlToJson(xml: string, indent = 2): { json: string; warnings: string[] } {
  const parsed = parseXml(xml)
  if (!parsed.ok) throw new Error(parsed.diagnostics[0]?.message ?? 'Invalid XML')
  return {
    json: JSON.stringify(parsed.object, null, indent),
    warnings: [
      ...parsed.warnings,
      'XML and JSON are different models. Comments, document order details, and some node distinctions may change.'
    ]
  }
}

export function jsonToXml(jsonText: string, indent = 2): { xml: string; warnings: string[] } {
  const value = JSON.parse(jsonText) as unknown
  const warnings: string[] = []
  let payload = value
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    payload = { root: value }
    warnings.push('The JSON root was not an object, so it was wrapped in <root>.')
  }
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    format: indent > 0,
    indentBy: ' '.repeat(indent),
    suppressEmptyNode: false
  })
  warnings.push('Attribute order and namespace prefixes may be normalized.')
  return { xml: builder.build(payload) as string, warnings }
}

export function conversionWarnings(xml: string): string[] {
  const warnings: string[] = []
  if (xml.includes('<!--')) warnings.push('Comments are kept in the XML editor. Object conversion may drop them.')
  if (xml.includes('<![CDATA[')) warnings.push('CDATA is preserved in the ordered XML model and becomes text in JSON.')
  if (xml.includes('<?') && !xml.trimStart().startsWith('<?xml')) {
    warnings.push('Processing instructions are kept only in the ordered XML model.')
  }
  return warnings
}
