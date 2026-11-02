import { inflateSync } from 'node:zlib'
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFRef,
  StandardFonts,
  decodePDFRawStream,
  degrees,
  rgb
} from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { EncryptedPdfError, errorMessage } from '../errors'
import { pageDrawsImages, rewriteTextShows } from './content-stream'

export interface PdfPageInfo {
  width: number
  height: number
  rotation: number
}

export interface PdfInfo {
  pageCount: number
  pages: PdfPageInfo[]
  title: string
  author: string
  encrypted: boolean
}

export interface PdfRect {
  x: number
  y: number
  width: number
  height: number
}

export async function inspectPdf(bytes: Uint8Array): Promise<PdfInfo> {
  const encrypted = await isEncrypted(bytes)
  const doc = await loadPdf(bytes)
  const subject = doc.getTitle() ?? ''
  return {
    pageCount: doc.getPageCount(),
    pages: doc.getPages().map((page) => ({
      width: page.getWidth(),
      height: page.getHeight(),
      rotation: page.getRotation().angle
    })),
    title: subject,
    author: doc.getAuthor() ?? '',
    encrypted
  }
}

export async function rotatePage(bytes: Uint8Array, pageIndex: number, delta: number): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  const page = doc.getPage(pageIndex)
  const angle = (page.getRotation().angle + delta) % 360
  page.setRotation(degrees(angle < 0 ? angle + 360 : angle))
  return save(doc)
}

export async function deletePage(bytes: Uint8Array, pageIndex: number): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  if (doc.getPageCount() < 2) throw new Error('A PDF must keep at least one page.')
  doc.removePage(pageIndex)
  return save(doc)
}

export async function duplicatePage(bytes: Uint8Array, pageIndex: number): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  const copied = await doc.copyPages(doc, [pageIndex])
  doc.insertPage(pageIndex + 1, copied[0])
  return save(doc)
}

export async function movePage(bytes: Uint8Array, from: number, to: number): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  const page = doc.getPage(from)
  doc.removePage(from)
  doc.insertPage(to, page)
  return save(doc)
}

export async function addBlankPage(bytes: Uint8Array, at: number, width = 612, height = 792): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  const page = doc.addPage([width, height])
  if (at < doc.getPageCount() - 1) {
    doc.removePage(doc.getPageCount() - 1)
    doc.insertPage(at, page)
  }
  return save(doc)
}

export async function extractPages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const source = await loadPdf(bytes)
  const next = await PDFDocument.create()
  const copied = await next.copyPages(source, indices)
  copied.forEach((page) => next.addPage(page))
  return save(next)
}

export async function mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  const next = await PDFDocument.create()
  for (const part of parts) {
    const source = await loadPdf(part)
    const copied = await next.copyPages(source, source.getPageIndices())
    copied.forEach((page) => next.addPage(page))
  }
  return save(next)
}

export async function splitPdf(bytes: Uint8Array): Promise<Uint8Array[]> {
  const info = await inspectPdf(bytes)
  const pages: Uint8Array[] = []
  for (let index = 0; index < info.pageCount; index += 1) {
    pages.push(await extractPages(bytes, [index]))
  }
  return pages
}

export async function setMetadata(
  bytes: Uint8Array,
  metadata: { title?: string; author?: string }
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  if (metadata.title !== undefined) doc.setTitle(metadata.title)
  if (metadata.author !== undefined) doc.setAuthor(metadata.author)
  return save(doc)
}

export async function addText(bytes: Uint8Array, pageIndex: number, text: string, rect: PdfRect, size = 16): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  const page = doc.getPage(pageIndex)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText(text, { x: rect.x, y: rect.y, size, font, color: rgb(0.1, 0.12, 0.14) })
  return save(doc)
}

export async function addOverlayText(
  bytes: Uint8Array,
  pageIndex: number,
  text: string,
  rect: PdfRect,
  size = 16
): Promise<{ bytes: Uint8Array; mode: 'overlay' }> {
  const doc = await loadPdf(bytes)
  const page = doc.getPage(pageIndex)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawRectangle({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, color: rgb(1, 1, 1) })
  page.drawText(text, { x: rect.x + 2, y: rect.y + 4, size, font, color: rgb(0, 0, 0) })
  return { bytes: await save(doc), mode: 'overlay' }
}

export async function addSquareAnnotation(bytes: Uint8Array, pageIndex: number, rect: PdfRect): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Square',
    Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
    C: [0.85, 0.25, 0.15],
    Border: [0, 0, 1.5],
    F: 4
  })
  pushAnnot(doc, pageIndex, annot)
  return save(doc)
}

export async function addNoteAnnotation(
  bytes: Uint8Array,
  pageIndex: number,
  rect: PdfRect,
  contents: string
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [rect.x, rect.y, rect.x + 24, rect.y + 24],
    Contents: PDFHexString.fromText(contents),
    Name: 'Comment',
    F: 4,
    Open: false
  })
  pushAnnot(doc, pageIndex, annot)
  return save(doc)
}

export async function addHighlightAnnotation(bytes: Uint8Array, pageIndex: number, rect: PdfRect): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  const x1 = rect.x
  const y1 = rect.y
  const x2 = rect.x + rect.width
  const y2 = rect.y + rect.height
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Highlight',
    Rect: [x1, y1, x2, y2],
    QuadPoints: [x1, y2, x2, y2, x1, y1, x2, y1],
    C: [1, 0.9, 0.2],
    CA: 0.45,
    F: 4
  })
  pushAnnot(doc, pageIndex, annot)
  return save(doc)
}

export async function addInkAnnotation(bytes: Uint8Array, pageIndex: number, points: Array<[number, number]>): Promise<Uint8Array> {
  if (points.length < 2) throw new Error('Ink annotations need at least two points.')
  const doc = await loadPdf(bytes)
  const flat = points.flatMap(([x, y]) => [x, y])
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Ink',
    Rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    InkList: [flat],
    C: [0.1, 0.25, 0.7],
    Border: [0, 0, 1.5],
    F: 4
  })
  pushAnnot(doc, pageIndex, annot)
  return save(doc)
}

export async function annotationSubtypes(bytes: Uint8Array, pageIndex: number): Promise<string[]> {
  const doc = await loadPdf(bytes)
  const page = doc.getPage(pageIndex)
  const annots = page.node.lookup(PDFName.of('Annots'))
  if (!(annots instanceof PDFArray)) return []
  const subtypes: string[] = []
  for (let index = 0; index < annots.size(); index += 1) {
    const dict = doc.context.lookup(annots.get(index))
    if (dict instanceof PDFDict) {
      const raw = dict.get(PDFName.of('Subtype'))
      const subtype = raw instanceof PDFName ? raw : doc.context.lookup(raw)
      subtypes.push(subtype instanceof PDFName ? subtype.decodeText() : 'unknown')
    }
  }
  return subtypes
}

export interface PdfField {
  name: string
  type: string
  value: string
}

export async function listFormFields(bytes: Uint8Array): Promise<PdfField[]> {
  const doc = await loadPdf(bytes)
  return doc.getForm().getFields().map((field) => {
    const type = field.constructor.name.replace(/^PDF/, '').replace(/Field$/, '')
    let value = ''
    if ('getText' in field && typeof field.getText === 'function') value = String(field.getText() ?? '')
    if ('isChecked' in field && typeof field.isChecked === 'function') value = field.isChecked() ? 'Yes' : 'Off'
    return { name: field.getName(), type, value }
  })
}

export async function fillForm(bytes: Uint8Array, values: Record<string, string | boolean>): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  const form = doc.getForm()
  for (const [name, value] of Object.entries(values)) {
    const field = form.getField(name)
    if ('setText' in field && typeof field.setText === 'function' && typeof value === 'string') field.setText(value)
    if ('check' in field && typeof field.check === 'function' && value === true) field.check()
    if ('uncheck' in field && typeof field.uncheck === 'function' && value === false) field.uncheck()
    if ('select' in field && typeof field.select === 'function' && typeof value === 'string') field.select(value)
  }
  return save(doc)
}

export async function flattenForm(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  doc.getForm().flatten()
  return save(doc)
}

export async function extractPdfText(bytes: Uint8Array): Promise<Array<{ page: number; text: string }>> {
  // pdf.js transfers the underlying ArrayBuffer into its worker, which empties the caller's bytes.
  const data = bytes.slice()
  const document = await getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0
  } as Parameters<typeof getDocument>[0]).promise
  const pages: Array<{ page: number; text: string }> = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    pages.push({ page: pageNumber, text })
  }
  await document.destroy()
  return pages
}

export interface RedactionPlan {
  canApply: boolean
  reason: string
  mode: 'content-removed' | 'blocked'
}

export async function planRedaction(bytes: Uint8Array, pageIndex: number, needle: string): Promise<RedactionPlan> {
  const content = await pageContent(bytes, pageIndex)
  const rewritten = rewriteTextShows(content, needle, null)
  if (pageDrawsImages(content) || rewritten.drawsImage) {
    return {
      canApply: false,
      reason: 'This page draws an image. File Studio will not redact it because image bytes cannot be proven removed.',
      mode: 'blocked'
    }
  }
  if (!rewritten.supported) {
    return {
      canApply: false,
      reason: 'The text is not stored as removable PDF text operators. Redaction is disabled for this selection.',
      mode: 'blocked'
    }
  }
  return { canApply: true, reason: 'The text operators can be removed from the page content.', mode: 'content-removed' }
}

export async function redactText(bytes: Uint8Array, pageIndex: number, needle: string): Promise<Uint8Array> {
  const plan = await planRedaction(bytes, pageIndex, needle)
  if (!plan.canApply) throw new Error(plan.reason)
  const doc = await loadPdf(bytes)
  const content = await readPageContent(doc, pageIndex)
  const rewritten = rewriteTextShows(content, needle, null)
  writePageContent(doc, pageIndex, rewritten.content)
  const saved = await save(doc)
  const visible = (await extractPdfText(saved)).map((page) => page.text).join('\n')
  const hidden = await streamsContain(saved, needle)
  if (visible.includes(needle) || hidden) {
    throw new Error('Redaction verification failed. The original PDF was not changed.')
  }
  return saved
}

export async function replaceLiteralText(
  bytes: Uint8Array,
  pageIndex: number,
  needle: string,
  replacement: string
): Promise<{ bytes: Uint8Array; mode: 'content-stream' | 'unsupported'; reason?: string }> {
  const content = await pageContent(bytes, pageIndex)
  const rewritten = rewriteTextShows(content, needle, replacement)
  if (!rewritten.supported || rewritten.drawsImage) {
    return {
      bytes,
      mode: 'unsupported',
      reason: 'Existing text is fragmented or encoded, so File Studio will not pretend to edit the original text object. Use overlay text instead.'
    }
  }
  const doc = await loadPdf(bytes)
  writePageContent(doc, pageIndex, rewritten.content)
  return { bytes: await save(doc), mode: 'content-stream' }
}

export async function streamsContain(bytes: Uint8Array, needle: string): Promise<boolean> {
  if (Buffer.from(bytes).includes(Buffer.from(needle))) return true
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue
    try {
      const decoded = Buffer.from(decodePDFRawStream(object).decode())
      if (decoded.includes(Buffer.from(needle))) return true
      try {
        if (inflateSync(decoded).includes(Buffer.from(needle))) return true
      } catch {
        // Not a flate payload.
      }
    } catch {
      // Skip streams that pdf-lib cannot decode.
    }
  }
  return false
}

export async function isEncrypted(bytes: Uint8Array): Promise<boolean> {
  try {
    await PDFDocument.load(bytes, { ignoreEncryption: false })
    return false
  } catch (error) {
    if (isEncryptionError(error)) return true
    throw error
  }
}

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false })
  } catch (error) {
    if (isEncryptionError(error)) {
      throw new EncryptedPdfError(
        'This PDF is encrypted. File Studio can open it for viewing when the password is supplied, but editing needs an unencrypted file.'
      )
    }
    throw error
  }
}

function isEncryptionError(error: unknown): boolean {
  return /encrypt|password/i.test(errorMessage(error))
}

function pushAnnot(doc: PDFDocument, pageIndex: number, annot: PDFDict): void {
  const page = doc.getPage(pageIndex)
  const ref = doc.context.register(annot)
  const existing = page.node.lookup(PDFName.of('Annots'), PDFArray)
  const list = existing ?? doc.context.obj([])
  list.push(ref)
  page.node.set(PDFName.of('Annots'), list)
}

async function pageContent(bytes: Uint8Array, pageIndex: number): Promise<string> {
  const doc = await loadPdf(bytes)
  return readPageContent(doc, pageIndex)
}

function readPageContent(doc: PDFDocument, pageIndex: number): string {
  const page = doc.getPage(pageIndex)
  const contents = page.node.lookup(PDFName.of('Contents'))
  const streams: PDFRawStream[] = []
  if (contents instanceof PDFRawStream) streams.push(contents)
  if (contents instanceof PDFArray) {
    for (let index = 0; index < contents.size(); index += 1) {
      const object = doc.context.lookup(contents.get(index))
      if (object instanceof PDFRawStream) streams.push(object)
    }
  }
  return streams.map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')).join('\n')
}

function writePageContent(doc: PDFDocument, pageIndex: number, content: string): void {
  const page = doc.getPage(pageIndex)
  const previous = contentRefs(page.node.get(PDFName.of('Contents')))
  const stream = doc.context.flateStream(Buffer.from(content, 'latin1'))
  page.node.set(PDFName.of('Contents'), doc.context.register(stream))
  for (const ref of previous) {
    if (!otherPageUsesContent(doc, pageIndex, ref)) doc.context.delete(ref)
  }
}

function contentRefs(value: unknown): PDFRef[] {
  if (value instanceof PDFRef) return [value]
  if (value instanceof PDFArray) {
    const refs: PDFRef[] = []
    for (let index = 0; index < value.size(); index += 1) {
      const item = value.get(index)
      if (item instanceof PDFRef) refs.push(item)
    }
    return refs
  }
  return []
}

function otherPageUsesContent(doc: PDFDocument, pageIndex: number, ref: PDFRef): boolean {
  const pages = doc.getPages()
  for (let index = 0; index < pages.length; index += 1) {
    if (index === pageIndex) continue
    const match = contentRefs(pages[index].node.get(PDFName.of('Contents'))).some(
      (candidate) => candidate.objectNumber === ref.objectNumber && candidate.generationNumber === ref.generationNumber
    )
    if (match) return true
  }
  return false
}

async function save(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: false })
}
