const PRIVATE_HOST = /^(localhost|.*\.localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|::1|\[::1\]|fe80:.*|fc[0-9a-f]{2}:.*|fd[0-9a-f]{2}:.*)$/i

export function assertFetchableUrl(input: string): URL {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error('Enter a full http or https address.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https addresses can be fetched.')
  if (url.username || url.password) throw new Error('Addresses with embedded passwords are refused.')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (PRIVATE_HOST.test(host) || PRIVATE_HOST.test(url.hostname)) {
    throw new Error('Local and private addresses are refused. Save the page and open the file instead.')
  }
  return url
}
