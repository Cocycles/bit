/** @flow */
import { loadScope, Scope, BitDependencies } from '../../scope';
import { BitIds } from '../../bit-id';
import Bit from '../../bit';
import { FsScopeNotLoaded } from '../exceptions';
import { flatten } from '../../utils';
import type { ScopeDescriptor } from '../../scope/scope';

export default class Fs {
  scopePath: string;
  scope: ?Scope;

  constructor(scopePath: string) {
    this.scopePath = scopePath;
  }

  close() {
    return this;
  }

  getScope(): Scope {
    if (!this.scope) throw new FsScopeNotLoaded();
    return this.scope;
  }

  describeScope(): Promise<ScopeDescriptor> {
    return Promise.resolve(this.getScope().describe());
  }

  push(bit: Bit) {
    return this.getScope().put(bit);
  }

  fetch(bitIds: BitIds): Promise<BitDependencies[]> {
    return this.getScope().getMany(bitIds)
      .then(bitsMatrix => flatten(bitsMatrix));
  }

  search(query: string) {
    return this.getScope().search(query);
  }

  fetchOnes(bitIds: BitIds): Promise<Bit[]> {
    return this.getScope().manyOnes(bitIds);
  }

  connect() {
    return loadScope(this.scopePath).then((scope) => {
      this.scope = scope;
      return this;
    });
  }
}
