import { describe, expect, it } from 'vitest'
import clientCharges from './calculateCharges.ts?raw'
import clientTypes from './types.ts?raw'
import clientQuote from './quote.ts?raw'
import serverCharges from '../../../supabase/functions/_shared/feeCalculator/calculateCharges.ts?raw'
import serverTypes from '../../../supabase/functions/_shared/feeCalculator/types.ts?raw'
import serverQuote from '../../../supabase/functions/_shared/feeCalculator/quote.ts?raw'

// The quotation functions (Deno) work out prices with a copy of the Fee Calculator's maths, because Deno needs the
// ".ts" on relative imports. The copy must be the same, character for character, apart from those import endings.
// If this fails, copy src/lib/feeCalculator/{calculateCharges,types,quote}.ts again and put ".ts" back on the imports.
const same = (source: string) => source.replace(/\r\n/g, '\n').replace(/from (['"])\.\/(calculateCharges|types)\.ts\1/g, 'from $1./$2$1')

describe('the server copy of the fee maths', () => {
  it.each([
    ['calculateCharges.ts', clientCharges, serverCharges],
    ['types.ts', clientTypes, serverTypes],
    ['quote.ts', clientQuote, serverQuote],
  ])('%s is the same as the Fee Calculator’s', (_name, client, server) => {
    expect(same(server)).toBe(same(client))
  })
})
