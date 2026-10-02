import { describe, expect, test } from 'vitest'
import BN from 'bn.js'
import { CollectFeeMode, type VirtualPool } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { creatorClaimable, hasClaimable, partnerClaimable, partnerLaunchFee, referralFeeToken, sumClaimable } from '../src'

type PoolState = VirtualPool['poolState']

const pool = (over: Partial<Record<keyof PoolState, unknown>> = {}) =>
    ({
        partnerQuoteFee: new BN(1_000),
        partnerBaseFee: new BN(0),
        creatorQuoteFee: new BN(700),
        creatorBaseFee: new BN(0),
        creationFeeBits: 0,
        ...over,
    }) as unknown as PoolState

const config = { poolCreationFee: new BN(50_000_000) } // 0.05 SOL

describe('partner claimable', () => {
    test('launch fee is everything but the protocol 10%', () => {
        expect(partnerLaunchFee(config).toNumber()).toBe(45_000_000)
    })

    test('unclaimed pool: trading fees plus launch fee', () => {
        const c = partnerClaimable(pool(), config)
        expect(c.quote.toNumber()).toBe(1_000)
        expect(c.launchFee.toNumber()).toBe(45_000_000)
    })

    test('launch fee already claimed by the partner', () => {
        expect(partnerClaimable(pool({ creationFeeBits: 0b10 }), config).launchFee.isZero()).toBe(true)
    })

    test("protocol claiming its share doesn't close the partner's", () => {
        expect(partnerClaimable(pool({ creationFeeBits: 0b01 }), config).launchFee.toNumber()).toBe(45_000_000)
    })

    test('configs without a launch fee', () => {
        const c = partnerClaimable(pool({ partnerQuoteFee: new BN(0) }), { poolCreationFee: new BN(0) })
        expect(hasClaimable(c)).toBe(false)
    })
})

describe('creator claimable', () => {
    test('trading fees only', () => {
        const c = creatorClaimable(pool())
        expect(c.quote.toNumber()).toBe(700)
        expect(c.launchFee.isZero()).toBe(true)
    })

    test('sums across pools', () => {
        const total = sumClaimable([creatorClaimable(pool()), creatorClaimable(pool({ creatorBaseFee: new BN(5) }))])
        expect(total.quote.toNumber()).toBe(1_400)
        expect(total.base.toNumber()).toBe(5)
    })
})

describe('referral fee token', () => {
    test('quote-collected configs always pay referrals in quote', () => {
        expect(referralFeeToken(CollectFeeMode.QuoteToken, false)).toBe('quote')
        expect(referralFeeToken(CollectFeeMode.QuoteToken, true)).toBe('quote')
    })

    test('output-collected configs pay buy referrals in the new token', () => {
        expect(referralFeeToken(CollectFeeMode.OutputToken, false)).toBe('base')
        expect(referralFeeToken(CollectFeeMode.OutputToken, true)).toBe('quote')
    })
})
