import BN from 'bn.js'
import {
    CollectFeeMode,
    PROTOCOL_POOL_CREATION_FEE_PERCENT,
    type PoolConfig,
    type VirtualPool,
} from '@meteora-ag/dynamic-bonding-curve-sdk'

type PoolState = VirtualPool['poolState']

// programs/dynamic-bonding-curve/src/state/virtual_pool.rs
const PARTNER_CREATION_FEE_CLAIMED_MASK = 0b10

export type Claimable = {
    /** Trading fees, in quote atoms. */
    quote: BN
    /** Trading fees, in base atoms (only when the config collects fees in the output token). */
    base: BN
    /** SOL launch fee, in lamports. */
    launchFee: BN
}

const ZERO = new BN(0)

/** Partner (preset author) share of the launch fee: everything but the protocol's 10%. */
export function partnerLaunchFee(config: Pick<PoolConfig, 'poolCreationFee'>): BN {
    const fee = config.poolCreationFee
    return fee.sub(fee.muln(PROTOCOL_POOL_CREATION_FEE_PERCENT).divn(100))
}

/** What the config's feeClaimer can withdraw from one pool right now. */
export function partnerClaimable(pool: PoolState, config: Pick<PoolConfig, 'poolCreationFee'>): Claimable {
    const launchFeeOpen = (pool.creationFeeBits & PARTNER_CREATION_FEE_CLAIMED_MASK) === 0
    return {
        quote: pool.partnerQuoteFee,
        base: pool.partnerBaseFee,
        launchFee: launchFeeOpen ? partnerLaunchFee(config) : ZERO,
    }
}

/** What the pool's creator can withdraw right now (no launch fee: the creator paid it). */
export function creatorClaimable(pool: PoolState): Claimable {
    return { quote: pool.creatorQuoteFee, base: pool.creatorBaseFee, launchFee: ZERO }
}

export const hasClaimable = (c: Claimable) => !c.quote.isZero() || !c.base.isZero() || !c.launchFee.isZero()

export function sumClaimable(items: Claimable[]): Claimable {
    return items.reduce(
        (acc, c) => ({ quote: acc.quote.add(c.quote), base: acc.base.add(c.base), launchFee: acc.launchFee.add(c.launchFee) }),
        { quote: ZERO, base: ZERO, launchFee: ZERO }
    )
}

/**
 * Which token a swap's referral fee is paid in. Mirrors the program's
 * FeeMode::get_fee_mode: fees land on the base token only for buys on
 * configs that collect fees in the output token.
 */
export function referralFeeToken(collectFeeMode: number, swapBaseForQuote: boolean): 'base' | 'quote' {
    return collectFeeMode === CollectFeeMode.OutputToken && !swapBaseForQuote ? 'base' : 'quote'
}
