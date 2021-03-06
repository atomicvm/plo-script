import { ApiPromise, WsProvider } from '@polkadot/api';
import { ChainType } from './ChainType';
import { dustyDefinitions, plasmCollatorDefinitions, plasmDefinitions } from '@plasm/types/dist/networkSpecs';
import type { RegistryTypes, IKeyringPair } from '@polkadot/types/types';
import BigNumber from 'bignumber.js';
import { AddressOrPair, ApiTypes, SubmittableExtrinsic } from '@polkadot/api/types';
import { SignerOptions } from '@polkadot/api/submittable/types';
import BN from 'bn.js';
import { FIEXD_DIGITS } from '../helper/batchTransfer';
import { pow10, toSDN } from '../helper/utils';

const AUTO_CONNECT_MS = 10_000; // [ms]

const makeEndpoint = (chain: ChainType): string => {
  switch (chain) {
    case 'rococo':
      return 'wss://rpc.dusty.plasmnet.io/';
    case 'kusama':
      return 'wss://rpc.shiden.plasmnet.io/';
    case 'polkadot':
      return 'wss://rpc.plasmnet.io/';
    case 'shibuya':
      return 'wss://rpc.shibuya.plasmnet.io/';
    default:
      return 'ws://127.0.0.1:9944';
  }
};

const makePlasmTypes = (chain: ChainType): RegistryTypes => {
  switch (chain) {
    case 'rococo':
      return dustyDefinitions as RegistryTypes;
    case 'kusama':
      return plasmCollatorDefinitions as RegistryTypes;
    case 'polkadot':
      return plasmDefinitions as RegistryTypes;
    case 'shibuya':
      return plasmCollatorDefinitions as RegistryTypes;
    default:
      return dustyDefinitions as RegistryTypes;
  }
};

export type VestingConfig = {
  srcAddress: string;
  perBlock: BigNumber;
  startingBlock: number;
};

export default class PlasmClient {
  private _provider: WsProvider;
  private _account: AddressOrPair;
  private _api: ApiPromise | undefined;
  private _chain: ChainType;

  constructor(chain: ChainType, account: AddressOrPair) {
    this._provider = new WsProvider(makeEndpoint(chain), AUTO_CONNECT_MS);
    this._account = account;
  }

  public async setup() {
    const types = makePlasmTypes(this._chain);
    this._api = await ApiPromise.create({
      provider: this._provider,
      types: {
        ...types,
        AccountInfo: 'AccountInfoWithTripleRefCount',
        Keys: 'SessionKeys4',
      },
    });
    return this._api.isReady;
  }

  public async nonce(): Promise<number | undefined> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((await this._api?.query.system.account((this._account as IKeyringPair).address)) as any)?.nonce.toNumber();
  }

  public batch(txs: SubmittableExtrinsic<ApiTypes>[]) {
    const ret = this._api?.tx.utility.batchAll(txs);
    if (ret) return ret;
    throw 'Undefined batch all';
  }

  public vestedTransfer(
    dest: string,
    balance: BigNumber,
    vestingConfig: VestingConfig,
  ): SubmittableExtrinsic<ApiTypes> {
    const lockedStr = toSDN(balance);
    const perBlockStr = toSDN(vestingConfig.perBlock);
    console.log(
      'vestedTransfer:',
      vestingConfig.srcAddress,
      dest,
      lockedStr,
      perBlockStr,
      vestingConfig.startingBlock.toString(),
    );
    const ret = this._api?.tx.vesting.forceVestedTransfer(vestingConfig.srcAddress, dest, {
      locked: lockedStr,
      perBlock: perBlockStr,
      startingBlock: vestingConfig.startingBlock,
    });
    if (ret) return ret;
    throw 'Undefined vested transfe';
  }

  public sudo(tx: SubmittableExtrinsic<ApiTypes>) {
    const ret = this._api?.tx.sudo.sudo(tx);
    if (ret) return ret;
    throw 'Undefined sudo';
  }

  public async signAndSend(tx: SubmittableExtrinsic<ApiTypes>, options?: Partial<SignerOptions>) {
    return await tx.signAndSend(this._account, options);
  }
}
