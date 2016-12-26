/** @flow */
import Bit from '../../bit';

export default class Source {
  src: any;

  constructor(src: any) {
    this.src = src;
  }
  
  create(bit: Bit): Source { // eslint-disable-line
    throw Error('every source must implelement a create method');
  }
}
