import { describe, expect, it } from 'vitest'
import { formatConnectErrorToast, parseConnectError } from '../connectErrorMessage'

describe('parseConnectError', () => {
  it('reads Error.message', () => {
    const { technical, hint } = parseConnectError(new Error('xhr poll error'))
    expect(technical).toBe('xhr poll error')
    expect(hint).toMatch(/firewall|blocking/i)
  })

  it('handles refused', () => {
    const { hint } = parseConnectError(new Error('ECONNREFUSED'))
    expect(hint).toMatch(/offline|sleeping|deploy/i)
  })

  it('handles string', () => {
    expect(parseConnectError('websocket error').technical).toBe('websocket error')
  })
})

describe('formatConnectErrorToast', () => {
  it('includes url line and technical detail', () => {
    const text = formatConnectErrorToast(new Error('network failure'))
    expect(text).toContain("Can't reach")
    expect(text).toContain('Address:')
    expect(text).toContain('network failure')
  })
})
